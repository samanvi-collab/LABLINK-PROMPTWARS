import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { User } from '../../../shared/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: User;
      validated: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId =
    incomingId && /^[a-zA-Z0-9_-]{4,64}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;
  req.validated = {};
  res.setHeader('X-Request-Id', requestId);
  next();
}
