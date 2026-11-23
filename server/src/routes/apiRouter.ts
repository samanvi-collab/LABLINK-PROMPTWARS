import { RequestHandler, Router } from 'express';
import {
  aiExplainSchedulingSchema,
  aiProjectMatchingSchema,
  aiRecommendationsSchema,
  analyticsQuerySchema,
  approveRequestSchema,
  archiveEquipmentSchema,
  auditLogsQuerySchema,
  availabilityQuerySchema,
  bookingsQuerySchema,
  cancelActionSchema,
  createAccessRequestSchema,
  createBookingSchema,
  createEquipmentSchema,
  createMaintenanceSchema,
  equipmentFilterQuerySchema,
  idParamSchema,
  maintenanceQuerySchema,
  rejectRequestSchema,
  requestsQuerySchema,
  updateEquipmentSchema,
  updateMaintenanceSchema,
} from '../../../shared/schemas';
import { AiController } from '../controllers/aiController';
import { AnalyticsController } from '../controllers/analyticsController';
import { AuditController } from '../controllers/auditController';
import { BookingController } from '../controllers/bookingController';
import { EquipmentController } from '../controllers/equipmentController';
import { MaintenanceController } from '../controllers/maintenanceController';
import { RequestController } from '../controllers/requestController';
import { SystemController } from '../controllers/systemController';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

export interface ApiRouterDeps {
  authenticate: RequestHandler;
  bookingRateLimiter: RequestHandler;
  aiRateLimiter: RequestHandler;
  systemController: SystemController;
  equipmentController: EquipmentController;
  bookingController: BookingController;
  requestController: RequestController;
  maintenanceController: MaintenanceController;
  analyticsController: AnalyticsController;
  auditController: AuditController;
  aiController: AiController;
}

export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  const {
    authenticate,
    bookingRateLimiter,
    aiRateLimiter,
    systemController,
    equipmentController,
    bookingController,
    requestController,
    maintenanceController,
    analyticsController,
    auditController,
    aiController,
  } = deps;

  // Public operational endpoints (never expose secrets)
  router.get('/health', systemController.health);
  router.get('/public-config', systemController.publicConfig);
  router.get('/demo/users', systemController.listDemoUsers);

  // Authenticated endpoints
  router.get('/me', authenticate, systemController.me);
  router.get('/auth/me', authenticate, systemController.me);
  router.post(
    '/demo/restore',
    authenticate,
    requireRole('Admin'),
    systemController.restoreDemoData,
  );

  // Equipment routes
  router.get(
    '/equipment',
    authenticate,
    validate({ query: equipmentFilterQuerySchema }),
    equipmentController.list,
  );
  router.get(
    '/equipment/:id',
    authenticate,
    validate({ params: idParamSchema }),
    equipmentController.getById,
  );
  router.post(
    '/equipment',
    authenticate,
    requireRole('Admin'),
    validate({ body: createEquipmentSchema }),
    equipmentController.create,
  );
  router.patch(
    '/equipment/:id',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ params: idParamSchema, body: updateEquipmentSchema }),
    equipmentController.update,
  );
  router.post(
    '/equipment/:id/archive',
    authenticate,
    requireRole('Admin'),
    validate({ params: idParamSchema, body: archiveEquipmentSchema }),
    equipmentController.archive,
  );
  router.get(
    '/equipment/:id/availability',
    authenticate,
    validate({ params: idParamSchema, query: availabilityQuerySchema }),
    equipmentController.availability,
  );

  // Booking routes
  router.get(
    '/bookings',
    authenticate,
    validate({ query: bookingsQuerySchema }),
    bookingController.list,
  );
  router.get(
    '/bookings/:id',
    authenticate,
    validate({ params: idParamSchema }),
    bookingController.getById,
  );
  router.post(
    '/bookings',
    authenticate,
    bookingRateLimiter,
    validate({ body: createBookingSchema }),
    bookingController.create,
  );
  router.post(
    '/bookings/:id/cancel',
    authenticate,
    validate({ params: idParamSchema, body: cancelActionSchema }),
    bookingController.cancel,
  );

  // Access Request routes
  router.get(
    '/requests',
    authenticate,
    validate({ query: requestsQuerySchema }),
    requestController.list,
  );
  router.get(
    '/requests/:id',
    authenticate,
    validate({ params: idParamSchema }),
    requestController.getById,
  );
  router.get(
    '/requests/:id/ranking',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ params: idParamSchema }),
    requestController.ranking,
  );
  router.post(
    '/requests',
    authenticate,
    bookingRateLimiter,
    validate({ body: createAccessRequestSchema }),
    requestController.create,
  );
  router.post(
    '/requests/:id/approve',
    authenticate,
    requireRole('Faculty', 'Admin'),
    bookingRateLimiter,
    validate({ params: idParamSchema, body: approveRequestSchema }),
    requestController.approve,
  );
  router.post(
    '/requests/:id/reject',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ params: idParamSchema, body: rejectRequestSchema }),
    requestController.reject,
  );
  router.post(
    '/requests/:id/cancel',
    authenticate,
    validate({ params: idParamSchema, body: cancelActionSchema }),
    requestController.cancel,
  );

  // Maintenance routes
  router.get(
    '/maintenance',
    authenticate,
    validate({ query: maintenanceQuerySchema }),
    maintenanceController.list,
  );
  router.post(
    '/maintenance',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ body: createMaintenanceSchema }),
    maintenanceController.create,
  );
  router.patch(
    '/maintenance/:id',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ params: idParamSchema, body: updateMaintenanceSchema }),
    maintenanceController.update,
  );

  // Analytics routes
  router.get(
    '/analytics/overview',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ query: analyticsQuerySchema }),
    analyticsController.overview,
  );
  router.get(
    '/analytics/utilization',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ query: analyticsQuerySchema }),
    analyticsController.utilization,
  );
  router.get(
    '/analytics/departments',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ query: analyticsQuerySchema }),
    analyticsController.departments,
  );

  // Audit logs
  router.get(
    '/audit-logs',
    authenticate,
    requireRole('Faculty', 'Admin'),
    validate({ query: auditLogsQuerySchema }),
    auditController.list,
  );

  // Advisory AI endpoints (authenticated, per-user rate-limited, strict Zod validation)
  router.post(
    '/ai/recommendations',
    authenticate,
    aiRateLimiter,
    validate({ body: aiRecommendationsSchema }),
    aiController.recommendations,
  );
  router.post(
    '/ai/project-matching',
    authenticate,
    aiRateLimiter,
    validate({ body: aiProjectMatchingSchema }),
    aiController.projectMatching,
  );
  router.post(
    '/ai/explain-scheduling',
    authenticate,
    aiRateLimiter,
    validate({ body: aiExplainSchedulingSchema }),
    aiController.explainScheduling,
  );

  // Unknown API routes return consistent JSON 404
  router.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        requestId: req.requestId,
      },
    });
  });

  return router;
}
