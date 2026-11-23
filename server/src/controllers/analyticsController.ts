import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { analyticsQuerySchema } from '../../../shared/schemas';
import { AnalyticsService } from '../services/analyticsService';

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  overview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof analyticsQuerySchema>;
      const overview = await this.analyticsService.getOverview(q, req.user!);
      res.json({ overview });
    } catch (err) {
      next(err);
    }
  };

  utilization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof analyticsQuerySchema>;
      const equipment = await this.analyticsService.getEquipmentUtilization(q, req.user!);
      res.json({ equipment });
    } catch (err) {
      next(err);
    }
  };

  departments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof analyticsQuerySchema>;
      const departments = await this.analyticsService.getDepartmentUsage(q, req.user!);
      res.json({ departments });
    } catch (err) {
      next(err);
    }
  };
}
