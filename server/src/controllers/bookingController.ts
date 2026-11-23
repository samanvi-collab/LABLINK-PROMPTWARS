import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  bookingsQuerySchema,
  cancelActionSchema,
  createBookingSchema,
  idParamSchema,
} from '../../../shared/schemas';
import { BookingService } from '../services/bookingService';

export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated.query as z.infer<typeof bookingsQuerySchema>;
      const result = await this.bookingService.list(
        {
          equipmentId: q.equipmentId,
          status: q.status,
          startTime: q.startTime,
          endTime: q.endTime,
        },
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
      const booking = await this.bookingService.getById(id, req.user!);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validated.body as z.infer<typeof createBookingSchema>;
      const booking = await this.bookingService.create(body, req.user!, req.requestId);
      res.status(201).json({ booking });
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated.params as z.infer<typeof idParamSchema>;
      const body = req.validated.body as z.infer<typeof cancelActionSchema>;
      const booking = await this.bookingService.cancel(
        id,
        body.reason,
        req.user!,
        req.requestId,
      );
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  };
}
