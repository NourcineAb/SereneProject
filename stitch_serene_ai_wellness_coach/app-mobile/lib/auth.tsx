import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, loadToken, setToken, setRefreshToken, loadRefreshToken, User } from './api';
import { syncPushToken } from './push';

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setUser(await api.me());
      // Fire-and-forget: sync push token whenever the session is refreshed
      void syncPushToken();
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) await refresh();
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { access_token, refresh_token } = await api.login(email, password);
    await setToken(access_token);
    if (refresh_token) await setRefreshToken(refresh_token);
    await refresh();
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { access_token, refresh_token } = await api.register(email, password, name);
    await setToken(access_token);
    if (refresh_token) await setRefreshToken(refresh_token);
    await refresh();
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // Best-effort: proceed with local sign-out even if the backend call fails
    }
    await setToken(null);
    await setRefreshToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
