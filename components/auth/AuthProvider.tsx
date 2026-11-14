'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearInMemoryAccessToken,
  getInMemoryAccessToken,
  setInMemoryAccessToken,
} from '@/lib/accessTokenStore';
import { AUTH_SESSION_EXPIRED_EVENT, type AuthSessionExpiredEventDetail } from '@/lib/auth-events';
import { getCookieValue } from '@/utils/cookies';
import { useUserSettings } from '@/hooks/useUserSettings';
import type { PricingTierId } from '@/lib/subscription-plans';
import { clearDashboardDocumentCache } from '@/lib/dashboard-document-cache';
import { useAppDispatch } from '@/store/hooks';
import { resetSession } from '@/store/slices/sessionSlice';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  orgId?: string | null;
  orgRole?: string | null;
  primaryOrgId?: string | null;
  orgPlan?: string | null;
  workspaceTier?: PricingTierId;
  firstName?: string;
  lastName?: string;
  name?: string;
  picture?: string;
}

interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
  deviceInfo?: string;
}

interface GoogleLoginInput {
  token: string;
  totpCode?: string;
}

interface LoginResult {
  mfaRequired?: boolean;
  message?: string;
  accountDeleted?: boolean;
  canRestore?: boolean;
  deletionScheduledAt?: string;
  user?: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  loginWithGoogle: (input: GoogleLoginInput) => Promise<LoginResult>;
  restoreAccount: (input: LoginInput) => Promise<LoginResult>;
  restoreAccountWithGoogle: (input: GoogleLoginInput) => Promise<LoginResult>;
  updateUser: (updates: Partial<AuthUser>) => void;
  refreshAccessToken: () => Promise<boolean>;
  logout: (options?: { notifySessionExpired?: boolean; message?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTHLESS_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/google',
  '/api/user/reset-password',
]);

function getPathname(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === 'string') {
      if (input.startsWith('/')) {
        return input.split('?')[0];
      }
      return new URL(input).pathname;
    }

    if (input instanceof URL) {
      return input.pathname;
    }

    return new URL(input.url).pathname;
  } catch {
    return null;
  }
}

async function isCsrfMismatchResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) {
    return false;
  }

  const payload = (await response.clone().json().catch(() => null)) as {
    reason?: string;
    message?: string;
  } | null;

  return payload?.reason === 'csrf_mismatch' || payload?.message === 'CSRF validation failed';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const sessionExpiredNotifiedRef = useRef(false);
  const hadAuthenticatedSessionRef = useRef(false);
  const authenticatedScopeRef = useRef<string | null>(null);
  const { settings: userSettings } = useUserSettings({
    enabled: Boolean(user),
    accountKey: user?.id ?? null,
  });

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const notifySessionExpired = useCallback((detail?: AuthSessionExpiredEventDetail) => {
    if (sessionExpiredNotifiedRef.current) {
      return;
    }
    sessionExpiredNotifiedRef.current = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<AuthSessionExpiredEventDetail>(AUTH_SESSION_EXPIRED_EVENT, { detail }));
    }
  }, []);

  const clearSessionState = useCallback((options?: { notifySessionExpired?: boolean; message?: string }) => {
    const hadAuthenticatedSession = hadAuthenticatedSessionRef.current;
    hadAuthenticatedSessionRef.current = false;
    accessTokenRef.current = null;
    authenticatedScopeRef.current = null;
    clearInMemoryAccessToken();
    if (hadAuthenticatedSession) {
      clearDashboardDocumentCache();
      dispatch(resetSession());
    }
    setAccessToken(null);
    setUser(null);
    if (options?.notifySessionExpired && hadAuthenticatedSession) {
      notifySessionExpired({ message: options.message });
    }
  }, [dispatch, notifySessionExpired]);

  const applyAuthenticatedSession = useCallback((payload: {
    accessToken?: string;
    token?: string;
    user?: AuthUser;
  }): void => {
    const token = payload.accessToken || payload.token;
    if (!token || !payload.user) {
      throw new Error('Authentication response is missing required fields');
    }

    const nextScope = `${payload.user.id}:${payload.user.orgId ?? 'personal'}`;
    if (authenticatedScopeRef.current && authenticatedScopeRef.current !== nextScope) {
      clearDashboardDocumentCache();
      dispatch(resetSession());
    }
    authenticatedScopeRef.current = nextScope;
    accessTokenRef.current = token;
    hadAuthenticatedSessionRef.current = true;
    sessionExpiredNotifiedRef.current = false;
    setInMemoryAccessToken(token);
    setAccessToken(token);
    setUser(payload.user);
  }, [dispatch]);

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshTask = async () => {
      const csrfToken = getCookieValue('csrf_token');
      // We attempt to refresh even if we can't read the CSRF token client-side.
      // The backend might accept the request or reject it, but we shouldn't
      // preemptively clear the session just because document.cookie is empty/restricted.

      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
          clearSessionState({
            notifySessionExpired: true,
            message: errorPayload?.message || 'Session expired. Please log in again.',
          });
          return false;
        }

        const payload = (await response.json()) as {
          accessToken?: string;
          user?: AuthUser;
        };

        if (!payload.accessToken || !payload.user) {
          clearSessionState({
            notifySessionExpired: true,
            message: 'Session expired. Please log in again.',
          });
          return false;
        }

        applyAuthenticatedSession(payload);
        return true;
      } catch (error) {
        console.error('Token refresh failed:', error);
        clearSessionState({
          notifySessionExpired: true,
          message: 'Session verification failed. Please log in again.',
        });
        return false;
      }
    };

    refreshPromiseRef.current = refreshTask();
    try {
      return await refreshPromiseRef.current;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [applyAuthenticatedSession, clearSessionState]);

  const login = useCallback(async (input: LoginInput): Promise<LoginResult> => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      user?: AuthUser;
      mfaRequired?: boolean;
      message?: string;
      reason?: string;
      canRestore?: boolean;
      deletionScheduledAt?: string;
    };

    if (!response.ok) {
      if (payload.message && payload.reason === 'account_deleted') {
        return {
          accountDeleted: true,
          canRestore: Boolean(payload.canRestore),
          deletionScheduledAt: payload.deletionScheduledAt,
          message: payload.message,
        };
      }
      throw new Error(payload.message || 'Login failed');
    }

    if (payload.mfaRequired) {
      return { mfaRequired: true, message: payload.message };
    }

    applyAuthenticatedSession(payload);

    return { user: payload.user };
  }, [applyAuthenticatedSession]);

  const loginWithGoogle = useCallback(async (input: GoogleLoginInput): Promise<LoginResult> => {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      token?: string;
      user?: AuthUser;
      mfaRequired?: boolean;
      message?: string;
      reason?: string;
      canRestore?: boolean;
      deletionScheduledAt?: string;
    };

    if (!response.ok) {
      if (payload.mfaRequired) {
        return { mfaRequired: true, message: payload.message };
      }
      if (payload.message && payload.reason === 'account_deleted') {
        return {
          accountDeleted: true,
          canRestore: Boolean(payload.canRestore),
          deletionScheduledAt: payload.deletionScheduledAt,
          message: payload.message,
        };
      }
      throw new Error(payload.message || 'Google authentication failed');
    }

    if (payload.mfaRequired) {
      return { mfaRequired: true, message: payload.message };
    }

    applyAuthenticatedSession(payload);

    return { user: payload.user };
  }, [applyAuthenticatedSession]);

  const restoreAccount = useCallback(async (input: LoginInput): Promise<LoginResult> => {
    const response = await fetch('/api/auth/restore', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      user?: AuthUser;
      mfaRequired?: boolean;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(payload.message || 'Account restoration failed');
    }

    if (payload.mfaRequired) {
      return { mfaRequired: true, message: payload.message };
    }

    applyAuthenticatedSession(payload);
    return { user: payload.user };
  }, [applyAuthenticatedSession]);

  const restoreAccountWithGoogle = useCallback(async (input: GoogleLoginInput): Promise<LoginResult> => {
    const response = await fetch('/api/auth/restore-google', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      user?: AuthUser;
      mfaRequired?: boolean;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(payload.message || 'Google account restoration failed');
    }

    if (payload.mfaRequired) {
      return { mfaRequired: true, message: payload.message };
    }

    applyAuthenticatedSession(payload);
    return { user: payload.user };
  }, [applyAuthenticatedSession]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) {
        return current;
      }

      const merged = {
        ...current,
        ...updates,
      };

      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        merged.name = `${merged.firstName || ''} ${merged.lastName || ''}`.trim();
      }

      return merged;
    });
  }, []);

  const logout = useCallback(async (options?: { notifySessionExpired?: boolean; message?: string }) => {
    const csrfToken = getCookieValue('csrf_token');

    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    }).catch(() => undefined);

    clearSessionState(options);
  }, [clearSessionState]);

  useEffect(() => {
    if (!user || !accessToken) {
      return;
    }
    const timeoutMinutes = userSettings.sessionTimeoutMinutes;
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return;
    }

    const timeoutMs = Math.max(1, timeoutMinutes) * 60 * 1000;
    let timeoutId: number | null = null;

    const resetTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        void logout({
          notifySessionExpired: true,
          message: 'Session ended due to inactivity. Please log in again.',
        });
      }, timeoutMs);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [accessToken, logout, user, userSettings.sessionTimeoutMinutes]);

  useEffect(() => {
    let mounted = true;
    let idleCallbackId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const initialize = async () => {
      if (mounted) {
        setIsLoading(true);
      }

      try {
        await refreshAccessToken();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const scheduleInitialize = () => {
      void initialize();
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(scheduleInitialize, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(scheduleInitialize, 1);
    }

    const interval = setInterval(() => {
      void refreshAccessToken();
    }, 10 * 60 * 1000);

    return () => {
      mounted = false;
      if (idleCallbackId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      clearInterval(interval);
    };
  }, [refreshAccessToken]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const patchedFetch: typeof fetch = async (input, init) => {
      const path = getPathname(input);
      const isApiRequest = Boolean(path && path.startsWith('/api/'));
      const skipAuthInjection = Boolean(path && AUTHLESS_API_PATHS.has(path));
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const requiresCsrf = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

      if (!isApiRequest) {
        return originalFetch(input, init);
      }

      const initialHeaders = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      let token = accessTokenRef.current || getInMemoryAccessToken();
      if (token && !skipAuthInjection && !initialHeaders.has('Authorization')) {
        initialHeaders.set('Authorization', `Bearer ${token}`);
      }
      if (requiresCsrf) {
        const csrfToken = getCookieValue('csrf_token');
        if (csrfToken) {
          // Always sync to the latest cookie value to avoid stale-token retries after refresh rotation.
          initialHeaders.set('X-CSRF-Token', csrfToken);
        }
      }

      const buildInit = (headers: Headers): RequestInit => ({
        ...init,
        headers,
        credentials: init?.credentials || 'include',
      });

      let response = await originalFetch(input, buildInit(initialHeaders));

      if (
        requiresCsrf &&
        !skipAuthInjection &&
        path !== '/api/auth/refresh' &&
        await isCsrfMismatchResponse(response)
      ) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const retryHeaders = new Headers(
            init?.headers || (input instanceof Request ? input.headers : undefined)
          );
          token = accessTokenRef.current || getInMemoryAccessToken();
          if (token && !retryHeaders.has('Authorization')) {
            retryHeaders.set('Authorization', `Bearer ${token}`);
          }
          const csrfToken = getCookieValue('csrf_token');
          if (csrfToken) {
            retryHeaders.set('X-CSRF-Token', csrfToken);
          }
          response = await originalFetch(input, buildInit(retryHeaders));
        }
      }

      if (
        response.status === 401 &&
        !skipAuthInjection &&
        path !== '/api/auth/refresh'
      ) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const retryHeaders = new Headers(
            init?.headers || (input instanceof Request ? input.headers : undefined)
          );
          token = accessTokenRef.current || getInMemoryAccessToken();
          if (token && !retryHeaders.has('Authorization')) {
            retryHeaders.set('Authorization', `Bearer ${token}`);
          }
          if (requiresCsrf) {
            const csrfToken = getCookieValue('csrf_token');
            if (csrfToken) {
              retryHeaders.set('X-CSRF-Token', csrfToken);
            }
          }
          response = await originalFetch(input, buildInit(retryHeaders));
        }
      }

      return response;
    };

    window.fetch = patchedFetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, [refreshAccessToken]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      login,
      loginWithGoogle,
      restoreAccount,
      restoreAccountWithGoogle,
      updateUser,
      refreshAccessToken,
      logout,
    }),
    [
      user,
      accessToken,
      isLoading,
      login,
      loginWithGoogle,
      restoreAccount,
      restoreAccountWithGoogle,
      updateUser,
      refreshAccessToken,
      logout,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
