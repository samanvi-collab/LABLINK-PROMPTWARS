import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  aiExplainSchedulingSchema,
  aiProjectMatchingSchema,
  aiRecommendationsSchema,
} from '../../../shared/schemas';
import { AiService } from '../ai/aiService';

export class AiController {
  constructor(private readonly aiService: AiService) {}

  recommendations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof aiRecommendationsSchema>;
      const result = await this.aiService.recommend(body, req.user!, req.requestId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  projectMatching = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof aiProjectMatchingSchema>;
      const result = await this.aiService.matchProject(body, req.user!, req.requestId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  explainScheduling = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof aiExplainSchedulingSchema>;
      const result = await this.aiService.explainScheduling(body, req.user!, req.requestId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
