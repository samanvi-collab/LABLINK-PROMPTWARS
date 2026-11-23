import { AlternativeSuggestions } from '../../../shared/types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly alternatives?: AlternativeSuggestions;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    options?: {
      details?: unknown;
      alternatives?: AlternativeSuggestions;
      isOperational?: boolean;
    },
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.alternatives = options?.alternatives;
    this.isOperational = options?.isOperational ?? true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request payload', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: unknown;
      alternatives?: AlternativeSuggestions;
    },
  ) {
    super(message, 409, options?.code ?? 'CONFLICT', {
      details: options?.details,
      alternatives: options?.alternatives,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'CONFIGURATION_ERROR', { details, isOperational: false });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
