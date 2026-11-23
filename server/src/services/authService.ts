import { Auth as FirebaseAuth } from 'firebase-admin/auth';
import { User } from '../../../shared/types';
import { AppConfig } from '../config/env';
import { IRepository } from '../repositories/IRepository';
import { UnauthorizedError } from '../utils/errors';

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
    private readonly firebaseAuth?: FirebaseAuth,
  ) {}

  async resolveUserFromRequest(headers: {
    authorization?: string;
    demoUserId?: string;
  }): Promise<User> {
    if (this.config.authMode === 'demo') {
      const demoId = headers.demoUserId?.trim();
      if (!demoId) {
        throw new UnauthorizedError(
          'Missing x-demo-user-id header in demo authentication mode',
        );
      }
      const user = await this.repository.getUserById(demoId);
      if (!user) {
        throw new UnauthorizedError(`Unknown demo user "${demoId}"`);
      }
      return user;
    }

    // Firebase Authentication mode — strictly verify Firebase ID token
    if (!this.firebaseAuth) {
      throw new UnauthorizedError('Firebase Auth client is not initialized');
    }

    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization Bearer token');
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      throw new UnauthorizedError('Empty Bearer token');
    }

    let decoded;
    try {
      decoded = await this.firebaseAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired Firebase ID token');
    }

    if (!decoded.uid) {
      throw new UnauthorizedError('Firebase ID token missing subject UID');
    }

    if (decoded.email_verified !== true) {
      throw new UnauthorizedError('Verified email address is required for Firebase authentication');
    }

    // Never trust client-supplied role headers or claims; look up authoritative user record.
    const existing = await this.repository.getUserById(decoded.uid);
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const newUser: User = {
      id: decoded.uid,
      email: decoded.email ?? `${decoded.uid}@campus.edu`,
      displayName: decoded.name ?? decoded.email ?? 'Campus User',
      role: 'Student',
      department: 'General',
      completedTrainings: [],
      safetyCleared: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return this.repository.upsertUser(newUser);
  }
}
