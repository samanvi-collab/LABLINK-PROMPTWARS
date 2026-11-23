import cors from 'cors';
import express, { Express } from 'express';
import { Auth as FirebaseAuth } from 'firebase-admin/auth';
import helmet from 'helmet';
import { AiService } from './ai/aiService';
import { GoogleGenAiClient, IGeminiJsonClient } from './ai/geminiClient';
import { AppConfig } from './config/env';
import { AiController } from './controllers/aiController';
import { AnalyticsController } from './controllers/analyticsController';
import { AuditController } from './controllers/auditController';
import { BookingController } from './controllers/bookingController';
import { EquipmentController } from './controllers/equipmentController';
import { MaintenanceController } from './controllers/maintenanceController';
import { RequestController } from './controllers/requestController';
import { SystemController } from './controllers/systemController';
import { createAuthenticateMiddleware } from './middleware/auth';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import {
  createAiUserRateLimiter,
  createBookingMutationLimiter,
  createGeneralRateLimiter,
} from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';
import { IRepository } from './repositories/IRepository';
import { createApiRouter } from './routes/apiRouter';
import { AnalyticsService } from './services/analyticsService';
import { AuthService } from './services/authService';
import { BookingService } from './services/bookingService';
import { EquipmentService } from './services/equipmentService';
import { MaintenanceService } from './services/maintenanceService';
import { AccessRequestService } from './services/requestService';
import { ForbiddenError } from './utils/errors';
import { logger } from './utils/logger';

export interface CreateAppOptions {
  config: AppConfig;
  repository: IRepository;
  firebaseAuth?: FirebaseAuth;
  geminiClient?: IGeminiJsonClient;
}

export function createApp(options: CreateAppOptions): Express {
  const { config, repository, firebaseAuth, geminiClient } = options;
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy:
        config.nodeEnv === 'production'
          ? {
              useDefaults: true,
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                  "'self'",
                  'https://apis.google.com',
                  'https://www.gstatic.com',
                ],
                styleSrc: [
                  "'self'",
                  "'unsafe-inline'",
                  'https://fonts.googleapis.com',
                ],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: [
                  "'self'",
                  'https://*.googleapis.com',
                  'https://*.firebaseio.com',
                  'https://*.firebaseapp.com',
                  'https://identitytoolkit.googleapis.com',
                  'https://securetoken.googleapis.com',
                ],
                frameSrc: [
                  "'self'",
                  'https://*.firebaseapp.com',
                  'https://accounts.google.com',
                ],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'"],
              },
            }
          : false,
      crossOriginEmbedderPolicy: false,
      // Allow Firebase Google signInWithPopup OAuth popup communication in production
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  const allowedOrigins = new Set<string>(config.corsOrigins);
  if (config.appUrl) {
    allowedOrigins.add(config.appUrl);
  }
  if (config.nodeEnv !== 'production') {
    allowedOrigins.add(`http://localhost:${config.port}`);
    allowedOrigins.add(`http://127.0.0.1:${config.port}`);
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          // Same-origin requests, curl, or server-to-server calls without Origin header
          callback(null, true);
          return;
        }
        if (allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new ForbiddenError(`Origin "${origin}" is not allowed by CORS policy`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Demo-User-Id', 'X-Request-Id'],
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('HTTP request completed', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  const generalLimiter = createGeneralRateLimiter(config);
  const bookingRateLimiter = createBookingMutationLimiter(config);
  const aiRateLimiter = createAiUserRateLimiter(config);

  const authService = new AuthService(config, repository, firebaseAuth);
  const equipmentService = new EquipmentService(config, repository);
  const bookingService = new BookingService(config, repository);
  const requestService = new AccessRequestService(config, repository);
  const maintenanceService = new MaintenanceService(repository);
  const analyticsService = new AnalyticsService(config, repository);
  const resolvedGeminiClient = geminiClient ?? new GoogleGenAiClient(config);
  const aiService = new AiService(config, repository, resolvedGeminiClient);

  const systemController = new SystemController(config, repository);
  const equipmentController = new EquipmentController(equipmentService);
  const bookingController = new BookingController(bookingService);
  const requestController = new RequestController(requestService);
  const maintenanceController = new MaintenanceController(maintenanceService);
  const analyticsController = new AnalyticsController(analyticsService);
  const auditController = new AuditController(repository);
  const aiController = new AiController(aiService);

  const apiRouter = createApiRouter({
    authenticate: createAuthenticateMiddleware(authService),
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
  });

  app.use('/api', generalLimiter, apiRouter);
  app.use(errorHandlerMiddleware);

  return app;
}

