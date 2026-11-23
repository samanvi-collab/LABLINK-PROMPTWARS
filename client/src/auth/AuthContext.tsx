import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicConfig, User } from '@shared/types';
import { ApiClientError, apiRequest, configureApiAuthProvider } from '../api/client';
import { usePublicConfig } from '../api/queries';
import {
  getFirebaseClient,
  onAuthStateChanged,
  signInFirebaseEmail,
  signInFirebaseGoogle,
  signOutFirebase,
} from './firebaseClient';

const DEMO_USER_STORAGE_KEY = 'lablink_demo_user_id';

export interface AuthContextValue {
  publicConfig: PublicConfig | null;
  configLoading: boolean;
  configError: Error | null;
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  isAuthenticated: boolean;
  demoUserId: string | null;
  selectDemoUser: (userId: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredDemoUserId(): string | null {
  try {
    return window.sessionStorage.getItem(DEMO_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredDemoUserId(userId: string | null): void {
  try {
    if (userId) {
      window.sessionStorage.setItem(DEMO_USER_STORAGE_KEY, userId);
    } else {
      window.sessionStorage.removeItem(DEMO_USER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures in restricted browser contexts
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const publicConfigQuery = usePublicConfig();
  const publicConfig = publicConfigQuery.data ?? null;

  const [demoUserId, setDemoUserId] = useState<string | null>(() => readStoredDemoUserId());
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const demoUserIdRef = useRef<string | null>(demoUserId);
  demoUserIdRef.current = demoUserId;

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    try {
      const data = await apiRequest<{ user: User }>('/api/me');
      setUser(data.user);
      setAuthError(null);
      return data.user;
    } catch (err) {
      setUser(null);
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setAuthError('Your session expired or authentication is required. Please sign in.');
        } else {
          setAuthError(err.message);
        }
      } else {
        setAuthError(err instanceof Error ? err.message : 'Unable to verify authentication.');
      }
      return null;
    }
  }, []);

  // Configure API client auth headers whenever publicConfig settles
  useEffect(() => {
    if (!publicConfig) {
      return;
    }

    if (publicConfig.authMode === 'demo') {
      configureApiAuthProvider({
        getHeaders: async (): Promise<Record<string, string>> => {
          const activeId = demoUserIdRef.current;
          return activeId ? { 'X-Demo-User-Id': activeId } : {};
        },
        onUnauthorized: () => {
          setUser(null);
          setDemoUserId(null);
          demoUserIdRef.current = null;
          writeStoredDemoUserId(null);
          setAuthError('Demo user session is invalid or expired. Please select a demo account.');
        },
      });
      return;
    }

    // Firebase auth mode
    const fb = getFirebaseClient(publicConfig.firebaseWebConfig);
    configureApiAuthProvider({
      getHeaders: async (forceRefresh = false): Promise<Record<string, string>> => {
        if (!fb?.auth.currentUser) {
          return {};
        }
        const token = await fb.auth.currentUser.getIdToken(forceRefresh);
        return { Authorization: `Bearer ${token}` };
      },
      onUnauthorized: () => {
        setUser(null);
        setAuthError('Authentication failed or token was rejected. Please sign in again.');
      },
    });
  }, [publicConfig]);

  // Synchronize user session from backend /api/me
  useEffect(() => {
    if (publicConfigQuery.isLoading) {
      setAuthLoading(true);
      return;
    }

    if (!publicConfig) {
      setAuthLoading(false);
      setUser(null);
      return;
    }

    if (publicConfig.authMode === 'demo') {
      if (!demoUserId) {
        setUser(null);
        setAuthLoading(false);
        return;
      }
      let active = true;
      setAuthLoading(true);
      void apiRequest<{ user: User }>('/api/me')
        .then((res) => {
          if (!active) return;
          setUser(res.user);
          setAuthError(null);
        })
        .catch(() => {
          if (!active) return;
          setUser(null);
          setDemoUserId(null);
          demoUserIdRef.current = null;
          writeStoredDemoUserId(null);
        })
        .finally(() => {
          if (active) setAuthLoading(false);
        });
      return () => {
        active = false;
      };
    }

    // Firebase mode: ensure no leftover demo header id exists
    writeStoredDemoUserId(null);
    if (demoUserId !== null) {
      setDemoUserId(null);
    }

    const fb = getFirebaseClient(publicConfig.firebaseWebConfig);
    if (!fb) {
      setUser(null);
      setAuthLoading(false);
      setAuthError('Firebase web configuration is unavailable from /api/public-config.');
      return;
    }

    setAuthLoading(true);
    const unsubscribe = onAuthStateChanged(fb.auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setAuthLoading(false);
        return;
      }
      void fetchCurrentUser().finally(() => {
        setAuthLoading(false);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [publicConfig, publicConfigQuery.isLoading, demoUserId, fetchCurrentUser]);

  const selectDemoUser = useCallback(
    async (userId: string) => {
      if (!publicConfig || publicConfig.authMode !== 'demo') {
        throw new Error('Demo authentication is disabled in production mode.');
      }
      setAuthLoading(true);
      setAuthError(null);
      demoUserIdRef.current = userId;
      setDemoUserId(userId);
      writeStoredDemoUserId(userId);
      try {
        const res = await apiRequest<{ user: User }>('/api/me');
        setUser(res.user);
        await queryClient.invalidateQueries();
      } catch (err) {
        demoUserIdRef.current = null;
        setDemoUserId(null);
        writeStoredDemoUserId(null);
        setUser(null);
        const msg = err instanceof Error ? err.message : 'Unable to switch demo user.';
        setAuthError(msg);
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [publicConfig, queryClient],
  );

  const loginWithGoogle = useCallback(async () => {
    if (!publicConfig || publicConfig.authMode !== 'firebase') {
      throw new Error('Google sign-in is only enabled in Firebase mode.');
    }
    const fb = getFirebaseClient(publicConfig.firebaseWebConfig);
    if (!fb) {
      throw new Error('Firebase client is not configured.');
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInFirebaseGoogle(fb.auth);
      await fetchCurrentUser();
      await queryClient.invalidateQueries();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setAuthError(msg);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  }, [publicConfig, fetchCurrentUser, queryClient]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!publicConfig || publicConfig.authMode !== 'firebase') {
        throw new Error('Email sign-in is only enabled in Firebase mode.');
      }
      const fb = getFirebaseClient(publicConfig.firebaseWebConfig);
      if (!fb) {
        throw new Error('Firebase client is not configured.');
      }
      setAuthError(null);
      setAuthLoading(true);
      try {
        await signInFirebaseEmail(fb.auth, email, password);
        await fetchCurrentUser();
        await queryClient.invalidateQueries();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid email or password.';
        setAuthError(msg);
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [publicConfig, fetchCurrentUser, queryClient],
  );

  const logout = useCallback(async () => {
    setAuthError(null);
    if (publicConfig?.authMode === 'firebase') {
      const fb = getFirebaseClient(publicConfig.firebaseWebConfig);
      if (fb) {
        await signOutFirebase(fb.auth);
      }
    }
    demoUserIdRef.current = null;
    setDemoUserId(null);
    writeStoredDemoUserId(null);
    setUser(null);
    queryClient.clear();
  }, [publicConfig, queryClient]);

  const refreshProfile = useCallback(async () => {
    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      publicConfig,
      configLoading: publicConfigQuery.isLoading,
      configError: publicConfigQuery.error instanceof Error ? publicConfigQuery.error : null,
      user,
      authLoading,
      authError,
      isAuthenticated: Boolean(user),
      demoUserId,
      selectDemoUser,
      loginWithGoogle,
      loginWithEmail,
      logout,
      refreshProfile,
      clearAuthError,
    }),
    [
      publicConfig,
      publicConfigQuery.isLoading,
      publicConfigQuery.error,
      user,
      authLoading,
      authError,
      demoUserId,
      selectDemoUser,
      loginWithGoogle,
      loginWithEmail,
      logout,
      refreshProfile,
      clearAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
