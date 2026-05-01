import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, setAuthToken } from "./queryClient";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "member";
  playerId: number | null;
}

interface AuthCtx {
  user: AuthUser | null;
  guestViewing: boolean;
  loading: boolean;
  signIn: (username: string, password: string, remember?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, guestViewing: true, loading: true,
  signIn: async () => {},
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guestViewing, setGuestViewing] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      setUser(data.user);
      setGuestViewing(data.guestViewing ?? true);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (username: string, password: string, remember: boolean = true) => {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    const data = await res.json();
    // Persist the token to localStorage when "Remember me" is checked so reloads
    // and tab restores stay signed in even if the auth cookie is stripped.
    setAuthToken(data.token, remember);
    setUser({ id: data.id, username: data.username, role: data.role, playerId: data.playerId });
  };

  const logout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch { /* ignore */ }
    setAuthToken(null, true); // also clears localStorage
    setUser(null);
  };

  useEffect(() => { refresh(); }, []);

  return <Ctx.Provider value={{ user, guestViewing, loading, signIn, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
