import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';
import { ValidationError } from '../utils/errors';

export interface ValidationSchemas<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> {
  body?: ZodType<TBody>;
  params?: ZodType<TParams>;
  query?: ZodType<TQuery>;
}

export function validate<TBody = unknown, TParams = unknown, TQuery = unknown>(
  schemas: ValidationSchemas<TBody, TParams, TQuery>,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw new ValidationError('Invalid route parameters', result.error.flatten());
        }
        req.validated.params = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw new ValidationError('Invalid query parameters', result.error.flatten());
        }
        req.validated.query = result.data;
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw new ValidationError('Invalid request body', result.error.flatten());
        }
        req.validated.body = result.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
