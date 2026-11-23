import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AppConfig } from '../config/env';

export function createGeneralRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down and try again shortly.',
          requestId: req.requestId,
        },
      });
    },
  });
}

export function createBookingMutationLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.bookingRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'BOOKING_RATE_LIMIT_EXCEEDED',
          message: 'Too many scheduling or approval requests. Please try again shortly.',
          requestId: req.requestId,
        },
      });
    },
  });
}

export function createAiUserRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.gemini.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `user:${req.user.id}`;
      }
      return ipKeyGenerator(req.ip ?? 'unknown');
    },
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'AI_RATE_LIMIT_EXCEEDED',
          message: 'Too many AI advisory requests. Please wait briefly before trying again.',
          requestId: req.requestId,
        },
      });
    },
  });
}

