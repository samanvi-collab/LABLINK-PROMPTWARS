import { applicationDefault, getApp, getApps, initializeApp, App } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { AppConfig } from './env';
import { ConfigurationError } from '../utils/errors';

export interface FirebaseAdminClients {
  app: App;
  auth: Auth;
  db: Firestore;
}

export function initializeFirebaseAdmin(config: AppConfig): FirebaseAdminClients {
  if (config.storageMode !== 'firestore' || config.authMode !== 'firebase') {
    throw new ConfigurationError(
      'Firebase Admin cannot be initialized unless STORAGE_MODE=firestore and AUTH_MODE=firebase',
    );
  }

  if (!config.firebase.projectId) {
    throw new ConfigurationError(
      'FIREBASE_PROJECT_ID is required to initialize Firebase Admin SDK',
    );
  }

  // Firebase Admin SDK automatically respects FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
  // When not using emulators, Application Default Credentials (ADC) are used without committing keys.
  const isEmulated = Boolean(
    config.firebase.firestoreEmulatorHost || config.firebase.authEmulatorHost,
  );

  const app = getApps().length
    ? getApp()
    : initializeApp(
        isEmulated
          ? { projectId: config.firebase.projectId }
          : {
              credential: applicationDefault(),
              projectId: config.firebase.projectId,
            },
      );

  const auth = getAuth(app);
  const db =
    config.firebase.databaseId && config.firebase.databaseId !== '(default)'
      ? getFirestore(app, config.firebase.databaseId)
      : getFirestore(app);

  return { app, auth, db };
}
