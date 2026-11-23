import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  createMaintenanceSchema,
  idParamSchema,
  maintenanceQuerySchema,
  updateMaintenanceSchema,
} from '../../../shared/schemas';
import { MaintenanceService } from '../services/maintenanceService';

export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof maintenanceQuerySchema>;
      const result = await this.maintenanceService.list(
        {
          equipmentId: q.equipmentId,
          activeOnly: q.activeOnly === 'true',
        },
        q.page,
        q.limit,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof createMaintenanceSchema>;
      const maintenanceWindow = await this.maintenanceService.create(
        body,
        req.user!,
        req.requestId,
      );
      res.status(201).json({ maintenanceWindow });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof updateMaintenanceSchema>;
      const maintenanceWindow = await this.maintenanceService.update(
        id,
        body,
        req.user!,
        req.requestId,
      );
      res.json({ maintenanceWindow });
    } catch (err) {
      next(err);
    }
  };
}
