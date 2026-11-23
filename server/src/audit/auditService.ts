import crypto from 'node:crypto';
import { AuditAction, AuditLog, UserRole } from '../../../shared/types';
import { IRepository } from '../repositories/IRepository';
import { logger, sanitizeMetadata } from '../utils/logger';

export interface CreateAuditInput {
  id?: string;
  actorId: string;
  actorRole: UserRole | 'System';
  action: AuditAction;
  targetType: AuditLog['targetType'];
  targetId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export function buildAuditLogEntry(input: CreateAuditInput): AuditLog {
  return {
    id: input.id ?? `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
    metadata: sanitizeMetadata(input.metadata ?? {}),
  };
}

/**
 * Provides idempotent audit recording with a deterministic recovery queue for operations
 * that cannot execute inside the primary storage transaction.
 */
export class AuditService {
  private readonly recoveryQueue = new Map<string, AuditLog>();

  constructor(private readonly repository: IRepository) {}

  async record(input: CreateAuditInput): Promise<AuditLog> {
    const entry = buildAuditLogEntry(input);
    try {
      await this.flushRecoveryQueue();
      return await this.repository.createAuditLog(entry);
    } catch (error) {
      this.recoveryQueue.set(entry.id, entry);
      logger.error('Audit log write failed; queued for idempotent recovery', {
        auditId: entry.id,
        action: entry.action,
        targetId: entry.targetId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return entry;
    }
  }

  async flushRecoveryQueue(): Promise<number> {
    if (this.recoveryQueue.size === 0) {
      return 0;
    }
    let flushed = 0;
    for (const [id, entry] of this.recoveryQueue.entries()) {
      try {
        await this.repository.createAuditLog(entry);
        this.recoveryQueue.delete(id);
        flushed += 1;
      } catch (error) {
        logger.warn('Audit recovery retry deferred', {
          auditId: id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return flushed;
  }

  getPendingRecoveryCount(): number {
    return this.recoveryQueue.size;
  }
}
