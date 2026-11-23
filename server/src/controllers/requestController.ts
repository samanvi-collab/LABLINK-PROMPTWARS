import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  approveRequestSchema,
  cancelActionSchema,
  createAccessRequestSchema,
  idParamSchema,
  rejectRequestSchema,
  requestsQuerySchema,
} from '../../../shared/schemas';
import { AccessRequestService } from '../services/requestService';

export class RequestController {
  constructor(private readonly requestService: AccessRequestService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof requestsQuerySchema>;
      const result = await this.requestService.list(
        {
          equipmentId: q.equipmentId,
          status: q.status,
        },
        q.sortBy,
        q.page,
        q.limit,
        req.user!,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const accessRequest = await this.requestService.getById(id, req.user!);
      res.json({ request: accessRequest });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof createAccessRequestSchema>;
      const accessRequest = await this.requestService.create(body, req.user!, req.requestId);
      res.status(201).json({ request: accessRequest });
    } catch (err) {
      next(err);
    }
  };

  ranking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const ranking = await this.requestService.getRanking(id, req.user!);
      res.json(ranking);
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof approveRequestSchema>;
      const result = await this.requestService.approve(
        id,
        body.decisionReason,
        body.overrideReason,
        req.user!,
        req.requestId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof rejectRequestSchema>;
      const accessRequest = await this.requestService.reject(
        id,
        body.decisionReason,
        req.user!,
        req.requestId,
      );
      res.json({ request: accessRequest });
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof cancelActionSchema>;
      const accessRequest = await this.requestService.cancel(
        id,
        body.reason,
        req.user!,
        req.requestId,
      );
      res.json({ request: accessRequest });
    } catch (err) {
      next(err);
    }
  };
}
