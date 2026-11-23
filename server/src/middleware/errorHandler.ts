import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiErrorResponse } from '../../../shared/types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId || 'unknown';

  if (err instanceof AppError) {
    const payload: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
        ...(err.alternatives !== undefined ? { alternatives: err.alternatives } : {}),
      },
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  if (err instanceof ZodError) {
    const payload: ApiErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        requestId,
        details: err.flatten(),
      },
    };
    res.status(400).json(payload);
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    const payload: ApiErrorResponse = {
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request body',
        requestId,
      },
    };
    res.status(400).json(payload);
    return;
  }

  const bodyParserErr = err as { type?: string; status?: number } | null;
  if (bodyParserErr?.type === 'entity.too.large' || bodyParserErr?.status === 413) {
    const payload: ApiErrorResponse = {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size',
        requestId,
      },
    };
    res.status(413).json(payload);
    return;
  }

  logger.error('Unhandled server error', {
    requestId,
    path: req.path,
    method: req.method,
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  });

  const payload: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
      requestId,
    },
  };
  res.status(500).json(payload);
}
