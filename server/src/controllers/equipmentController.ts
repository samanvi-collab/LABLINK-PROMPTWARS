import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  archiveEquipmentSchema,
  availabilityQuerySchema,
  createEquipmentSchema,
  equipmentFilterQuerySchema,
  idParamSchema,
  updateEquipmentSchema,
} from '../../../shared/schemas';
import { EquipmentService } from '../services/equipmentService';

export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof equipmentFilterQuerySchema>;
      const result = await this.equipmentService.list(
        {
          department: q.department,
          category: q.category,
          search: q.search,
          includeArchived: q.includeArchived === 'true',
        },
        q.page,
        q.limit,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const equipment = await this.equipmentService.getById(id);
      res.json({ equipment });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof createEquipmentSchema>;
      const equipment = await this.equipmentService.create(body, req.user!, req.requestId);
      res.status(201).json({ equipment });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof updateEquipmentSchema>;
      const equipment = await this.equipmentService.update(id, body, req.user!, req.requestId);
      res.json({ equipment });
    } catch (err) {
      next(err);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof archiveEquipmentSchema>;
      const equipment = await this.equipmentService.setArchived(
        id,
        body.archived,
        body.reason,
        req.user!,
        req.requestId,
      );
      res.json({ equipment });
    } catch (err) {
      next(err);
    }
  };

  availability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const q = req.validated.query as z.infer<typeof availabilityQuerySchema>;
      const availability = await this.equipmentService.getAvailability(
        id,
        q.startTime,
        q.endTime,
        req.user!,
      );
      res.json({ availability });
    } catch (err) {
      next(err);
    }
  };
}
