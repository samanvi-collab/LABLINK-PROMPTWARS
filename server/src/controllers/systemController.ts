import { NextFunction, Request, Response } from 'express';
import { HealthStatus, PublicConfig } from '../../../shared/types';
import { AppConfig } from '../config/env';
import { IRepository } from '../repositories/IRepository';
import { ForbiddenError } from '../utils/errors';

export class SystemController {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
  ) {}

  private isGeminiConfigured(): boolean {
    return this.config.gemini.configured;
  }

  health = (_req: Request, res: Response): void => {
    const payload: HealthStatus = {
      status: 'ok',
      service: 'lablink-api',
      version: this.config.version,
      storageMode: this.config.storageMode,
      authMode: this.config.authMode,
      demoMode: this.config.demoMode,
      timezone: this.config.timezone,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      firebaseConfigured: Boolean(this.config.firebase.projectId && this.config.firebase.webConfig),
      geminiConfigured: this.isGeminiConfigured(),
    };
    res.json(payload);
  };

  publicConfig = (_req: Request, res: Response): void => {
    const payload: PublicConfig = {
      appName: 'LABLINK',
      version: this.config.version,
      storageMode: this.config.storageMode,
      authMode: this.config.authMode,
      demoMode: this.config.demoMode,
      timezone: this.config.timezone,
      firebaseConfigured: Boolean(this.config.firebase.projectId && this.config.firebase.webConfig),
      geminiConfigured: this.isGeminiConfigured(),
      firebaseWebConfig: this.config.firebase.webConfig,
    };
    res.json(payload);
  };

  me = (req: Request, res: Response): void => {
    res.json({ user: req.user });
  };

  listDemoUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.config.demoMode) {
        throw new ForbiddenError('Demo user directory is disabled outside demo mode');
      }
      const users = await this.repository.listUsers();
      res.json({ users });
    } catch (err) {
      next(err);
    }
  };

  restoreDemoData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.config.demoMode || !this.repository.restoreDemoData) {
        throw new ForbiddenError('Demo restoration is only available in demo mode');
      }
      await this.repository.restoreDemoData(req.user!, req.requestId);
      res.json({
        restored: true,
        message: 'Demo dataset restored deterministically',
      });
    } catch (err) {
      next(err);
    }
  };
}
