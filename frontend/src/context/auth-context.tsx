import * as React from "react";

import { ApiError, api, onUnauthorized } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  signup: (payload: { name: string; email: string; password: string; currency: string }) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  updateUser: (patch: Partial<User>) => void;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      return me;
    } catch (err) {
      // A 401 here just means "not signed in", which is a normal first load.
      if (!(err instanceof ApiError) || err.status !== 401) {
        console.error("Session check failed", err);
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // When any request reports the session is gone, drop the user immediately so
  // the router sends them to the login screen rather than showing empty pages.
  React.useEffect(() => onUnauthorized(() => setUser(null)), []);

  const signup = React.useCallback(
    async (payload: { name: string; email: string; password: string; currency: string }) => {
      const result = await api.post<{ user: User }>("/auth/signup", payload);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const login = React.useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: User }>("/auth/login", { email, password });
    setUser(result.user);
    return result.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Even if the call fails, clear locally - the cookie may already be gone.
    }
    setUser(null);
  }, []);

  const updateUser = React.useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, signup, login, logout, refresh, updateUser }),
    [user, loading, signup, login, logout, refresh, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Convenience: the signed-in user's currency, defaulting to INR. */
export function useCurrency(): string {
  const { user } = useAuth();
  return user?.currency ?? "INR";
}
