import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../../../shared/types';
import { AuthService } from '../services/authService';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export function createAuthenticateMiddleware(authService: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authService.resolveUserFromRequest({
        authorization: req.header('authorization'),
        demoUserId: req.header('x-demo-user-id'),
      });
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `Role "${req.user.role}" is not permitted to access this resource`,
        ),
      );
      return;
    }
    next();
  };
}
