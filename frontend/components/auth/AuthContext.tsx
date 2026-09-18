'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMe, logout as apiLogout, refreshAuth } from '@/lib/api';
import type { AuthUser, AuthAdmin, MeResponse } from '@/lib/types';

interface AuthState {
  loading: boolean;
  type: 'customer' | 'admin' | null;
  user: AuthUser | null;
  admin: AuthAdmin | null;
}

interface AuthCtx extends AuthState {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  loading: true,
  type: null,
  user: null,
  admin: null,
  refresh: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    type: null,
    user: null,
    admin: null,
  });

  const load = useCallback(async () => {
    try {
      const me: MeResponse = await getMe();
      setState({
        loading: false,
        type: me.type,
        user: me.user ?? null,
        admin: me.admin ?? null,
      });
    } catch {
      // Token might be expired — try refresh
      try {
        await refreshAuth();
        const me: MeResponse = await getMe();
        setState({
          loading: false,
          type: me.type,
          user: me.user ?? null,
          admin: me.admin ?? null,
        });
      } catch {
        setState({ loading: false, type: null, user: null, admin: null });
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore
    }
    setState({ loading: false, type: null, user: null, admin: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh: load, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
