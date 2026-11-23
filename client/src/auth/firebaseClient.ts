import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { PublicConfig } from '@shared/types';

export interface FirebaseClientHandle {
  app: FirebaseApp;
  auth: Auth;
}

let cachedHandle: FirebaseClientHandle | null = null;
let cachedConfigKey: string | null = null;

export function getFirebaseClient(
  webConfig: PublicConfig['firebaseWebConfig'],
): FirebaseClientHandle | null {
  if (!webConfig) {
    return null;
  }
  const key = `${webConfig.projectId}:${webConfig.appId}`;
  if (cachedHandle && cachedConfigKey === key) {
    return cachedHandle;
  }

  const app = getApps().length ? getApp() : initializeApp(webConfig);
  const auth = getAuth(app);
  cachedHandle = { app, auth };
  cachedConfigKey = key;
  return cachedHandle;
}

export async function signInFirebaseGoogle(auth: Auth): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signInFirebaseEmail(
  auth: Auth,
  email: string,
  password: string,
): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutFirebase(auth: Auth): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
