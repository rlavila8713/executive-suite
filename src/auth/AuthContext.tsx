import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DeviceAccessContext } from '../types';
import { api } from '../api/client';
import { getAuthToken, setAuthToken } from './token';

export type AuthStatus = {
  loginRequired: boolean;
  needsBootstrap: boolean;
  storeName: string;
};

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  access: DeviceAccessContext | null;
  status: AuthStatus | null;
  login: (username: string, password: string) => Promise<void>;
  bootstrap: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [access, setAccess] = useState<DeviceAccessContext | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const refreshSession = useCallback(async () => {
    const [st, session] = await Promise.all([api.getAuthStatus(), api.getAuthSession()]);
    setStatus(st);
    if (st.needsBootstrap) {
      setAuthenticated(false);
      setAccess(null);
      return;
    }
    if (session.authenticated && session.access) {
      setAuthenticated(true);
      setAccess(session.access);
      return;
    }
    setAuthenticated(false);
    setAccess(null);
    if (!st.loginRequired) {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    setAuthToken(result.token);
    setAuthenticated(true);
    setAccess(result.access);
    await refreshSession();
  }, [refreshSession]);

  const bootstrap = useCallback(async (username: string, password: string) => {
    await api.bootstrapAuth(username, password);
    await login(username, password);
  }, [login]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAuthToken(null);
      setAuthenticated(false);
      setAccess(null);
      await refreshSession();
    }
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      loading,
      authenticated,
      access,
      status,
      login,
      bootstrap,
      logout,
      refreshSession,
    }),
    [loading, authenticated, access, status, login, bootstrap, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
