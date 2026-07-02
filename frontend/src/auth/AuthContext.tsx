import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getUserMe } from '../api/marketplace';
import type { AuthUser } from '../api/types';
import { profileToAuthUser } from '../utils/user-profile';

const STORAGE_KEY = 'rip_market_auth';

type StoredAuth = {
  token: string;
  user: AuthUser;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());

  const login = useCallback((token: string, user: AuthUser) => {
    const next = { token, user };
    setAuth(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateUser = useCallback((user: AuthUser) => {
    setAuth((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, user };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!auth?.token) {
      return;
    }

    let cancelled = false;
    getUserMe(auth.token)
      .then((profile) => {
        if (!cancelled) {
          updateUser(profileToAuthUser(profile));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [auth?.token, updateUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: auth?.token ?? null,
      user: auth?.user ?? null,
      login,
      updateUser,
      logout,
    }),
    [auth, login, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
