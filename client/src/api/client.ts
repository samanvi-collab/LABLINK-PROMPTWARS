import type { AlternativeSuggestions, ApiErrorResponse } from '@shared/types';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string;
  public readonly details?: unknown;
  public readonly alternatives?: AlternativeSuggestions;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    requestId: string;
    details?: unknown;
    alternatives?: AlternativeSuggestions;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details;
    this.alternatives = params.alternatives;
  }
}

export interface AuthHeaderProvider {
  getHeaders: (forceRefresh?: boolean) => Promise<Record<string, string>>;
  onUnauthorized?: () => void;
}

let headerProvider: AuthHeaderProvider = {
  getHeaders: async () => ({}),
};

export function configureApiAuthProvider(provider: AuthHeaderProvider): void {
  headerProvider = provider;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  const normalized = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) {
    return normalized;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${normalized}?${qs}` : normalized;
}

async function parseErrorEnvelope(
  response: Response,
  fallbackRequestId: string,
): Promise<ApiClientError> {
  const headerReqId = response.headers.get('x-request-id') ?? fallbackRequestId;
  try {
    const json = (await response.json()) as Partial<ApiErrorResponse>;
    if (json && json.error) {
      return new ApiClientError({
        message: json.error.message || `Request failed with status ${response.status}`,
        status: response.status,
        code: json.error.code || 'API_ERROR',
        requestId: json.error.requestId || headerReqId,
        details: json.error.details,
        alternatives: json.error.alternatives,
      });
    }
  } catch {
    // Non-JSON response body
  }

  return new ApiClientError({
    message: response.statusText || `HTTP ${response.status}`,
    status: response.status,
    code: response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'API_ERROR',
    requestId: headerReqId,
  });
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const method = options.method ?? 'GET';

  const execute = async (forceRefresh: boolean): Promise<Response> => {
    const authHeaders = options.skipAuth ? {} : await headerProvider.getHeaders(forceRefresh);
    const headers: Record<string, string> = {
      ...authHeaders,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let response = await execute(false);

  // If 401 occurs in token-based auth, attempt a single forced token refresh before failing.
  if (response.status === 401 && !options.skipAuth) {
    const refreshedHeaders = await headerProvider.getHeaders(true);
    if (refreshedHeaders.Authorization) {
      response = await execute(true);
    }
  }

  if (!response.ok) {
    const err = await parseErrorEnvelope(response, 'unknown');
    if (response.status === 401 && !options.skipAuth) {
      headerProvider.onUnauthorized?.();
    }
    throw err;
  }

  return response.json() as Promise<T>;
}
