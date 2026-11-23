import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { auditLogsQuerySchema } from '../../../shared/schemas';
import { IRepository } from '../repositories/IRepository';
import { ForbiddenError } from '../utils/errors';
import { paginate } from '../validation/pagination';

export class AuditController {
  constructor(private readonly repository: IRepository) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user!.role !== 'Faculty' && req.user!.role !== 'Admin') {
        throw new ForbiddenError('Only Faculty or Admin users can view audit logs');
      }
      const q = req.validated.query as z.infer<typeof auditLogsQuerySchema>;
      const items = await this.repository.listAuditLogs({
        actorId: q.actorId,
        targetId: q.targetId,
        action: q.action,
      });
      res.json(paginate(items, q.page, q.limit));
    } catch (err) {
      next(err);
    }
  };
}
