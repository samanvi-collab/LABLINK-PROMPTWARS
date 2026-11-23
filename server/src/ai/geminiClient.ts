import { GoogleGenAI, type Schema } from '@google/genai';
import { z } from 'zod';
import { AppConfig } from '../config/env';
import { logger } from '../utils/logger';

export type GeminiFailureReason =
  | 'UNCONFIGURED'
  | 'TIMEOUT'
  | 'QUOTA_EXCEEDED'
  | 'TRANSIENT_ERROR'
  | 'INVALID_RESPONSE'
  | 'BAD_REQUEST';

export class GeminiCallError extends Error {
  constructor(
    public readonly reason: GeminiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiCallError';
  }
}

export interface GenerateStructuredJsonInput<T> {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Schema;
  zodSchema: z.ZodType<T>;
}

export interface IGeminiJsonClient {
  isConfigured(): boolean;
  getModelName(): string;
  generateStructuredJson<T>(input: GenerateStructuredJsonInput<T>): Promise<T>;
}

function classifyGeminiError(err: unknown): { reason: GeminiFailureReason; retryable: boolean; message: string } {
  if (err instanceof GeminiCallError) {
    return {
      reason: err.reason,
      retryable: err.reason === 'TRANSIENT_ERROR',
      message: err.message,
    };
  }

  const candidate = err as { status?: number; code?: string | number; message?: string } | undefined;
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;
  const codeStr = typeof candidate?.code === 'string' ? candidate.code : '';
  const msg = candidate?.message ?? 'Gemini request failed';

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return { reason: 'QUOTA_EXCEEDED', retryable: false, message: 'Gemini quota or rate limit reached' };
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { reason: 'BAD_REQUEST', retryable: false, message: `Gemini rejected request (${status})` };
  }
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UNAVAILABLE/i.test(`${codeStr} ${msg}`)
  ) {
    return { reason: 'TRANSIENT_ERROR', retryable: true, message: 'Transient Gemini upstream error' };
  }

  return { reason: 'INVALID_RESPONSE', retryable: false, message: 'Unexpected Gemini failure' };
}

export class GoogleGenAiClient implements IGeminiJsonClient {
  private readonly client: GoogleGenAI | null;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: AppConfig) {
    this.model = config.gemini.model;
    this.timeoutMs = config.gemini.timeoutMs;
    this.client = config.gemini.apiKey
      ? new GoogleGenAI({
          apiKey: config.gemini.apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getModelName(): string {
    return this.model;
  }

  async generateStructuredJson<T>(input: GenerateStructuredJsonInput<T>): Promise<T> {
    if (!this.client) {
      throw new GeminiCallError('UNCONFIGURED', 'Gemini API key is not configured');
    }

    const maxAttempts = 2; // 1 initial attempt + at most 1 transient retry
    let lastErr: GeminiCallError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new GeminiCallError('TIMEOUT', `Gemini request timed out after ${this.timeoutMs}ms`));
          }, this.timeoutMs);
        });

        const sdkPromise = this.client.models.generateContent({
          model: this.model,
          contents: input.userPrompt,
          config: {
            systemInstruction: input.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: input.responseSchema,
          },
        });

        const response = await Promise.race([sdkPromise, timeoutPromise]);
        const rawText = response.text?.trim();
        if (!rawText) {
          throw new GeminiCallError('INVALID_RESPONSE', 'Gemini returned an empty response');
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          throw new GeminiCallError('INVALID_RESPONSE', 'Gemini returned malformed JSON');
        }

        const validated = input.zodSchema.safeParse(parsedJson);
        if (!validated.success) {
          throw new GeminiCallError('INVALID_RESPONSE', 'Gemini response failed schema validation');
        }

        return validated.data;
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastErr = new GeminiCallError(classified.reason, classified.message);

        if (!classified.retryable || attempt >= maxAttempts) {
          logger.warn('Gemini invocation fell back to deterministic rules', {
            reason: classified.reason,
            attempt,
          });
          throw lastErr;
        }

        logger.warn('Transient Gemini error; executing single retry', {
          reason: classified.reason,
          attempt,
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    throw lastErr ?? new GeminiCallError('INVALID_RESPONSE', 'Gemini call failed');
  }
}
