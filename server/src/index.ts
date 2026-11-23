import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app';
import { validateEnvironment } from './config/env';
import { initializeFirebaseAdmin } from './config/firebase';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { DemoRepository } from './repositories/DemoRepository';
import { FirestoreRepository } from './repositories/FirestoreRepository';
import { IRepository } from './repositories/IRepository';
import { logger } from './utils/logger';

function resolveClientDistPath(): string {
  // Works both in tsx dev (server/src/index.ts) and compiled CJS (dist/server/server/src/index.js)
  const candidates = [
    path.resolve(__dirname, '../../../../dist/client'),
    path.resolve(__dirname, '../../dist/client'),
    path.resolve(process.cwd(), 'dist/client'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), 'dist/client');
}

async function bootstrap(): Promise<void> {
  const config = validateEnvironment(process.env);

  let repository: IRepository;
  let firebaseAuth;

  if (config.storageMode === 'firestore') {
    const firebaseClients = initializeFirebaseAdmin(config);
    firebaseAuth = firebaseClients.auth;
    repository = new FirestoreRepository(firebaseClients.db);
    logger.info('LABLINK repository initialized in Firestore mode', {
      projectId: config.firebase.projectId,
      databaseId: config.firebase.databaseId,
    });
  } else {
    repository = new DemoRepository();
    logger.warn('LABLINK running in non-persistent DEMO MODE', {
      storageMode: config.storageMode,
      authMode: config.authMode,
    });
  }

  const app = createApp({
    config,
    repository,
    firebaseAuth,
  });

  if (config.nodeEnv === 'production') {
    const clientDist = resolveClientDistPath();
    if (fs.existsSync(path.join(clientDist, 'index.html'))) {
      app.use(express.static(clientDist));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          next();
          return;
        }
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    } else {
      logger.warn('Production static client build not found', { clientDist });
    }
  } else {
    // Dynamically import Vite only in development so production builds stay lean
    const vitePkg = 'vite';
    const viteMod = (await import(vitePkg)) as {
      createServer: (opts: {
        server: { middlewareMode: boolean };
        appType: string;
      }) => Promise<{ middlewares: express.RequestHandler }>;
    };
    const vite = await viteMod.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use(errorHandlerMiddleware);

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('LABLINK server listening', {
      port: config.port,
      nodeEnv: config.nodeEnv,
      storageMode: config.storageMode,
      authMode: config.authMode,
      timezone: config.timezone,
    });
  });

  const shutdown = (signal: string) => {
    logger.info('Shutdown signal received; closing HTTP server', { signal });
    const forceTimer = setTimeout(() => {
      logger.warn('Graceful shutdown timed out; exiting process', { signal });
      process.exit(1);
    }, 9_000);
    forceTimer.unref();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        logger.error('Error closing HTTP server', {
          signal,
          errorMessage: err.message,
        });
        process.exit(1);
      }
      logger.info('HTTP server closed cleanly', { signal });
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('LABLINK startup failed', {
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
