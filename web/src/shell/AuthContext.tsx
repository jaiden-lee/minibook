import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type AuthStatus = "idle" | "loading" | "ready" | "authenticated" | "error";

type GoogleProfile = {
  name?: string;
  email?: string;
  picture?: string;
};

type AuthContextValue = {
  isConfigured: boolean;
  isAuthenticated: boolean;
  status: AuthStatus;
  profile: GoogleProfile | null;
  error: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  refreshStatus: () => Promise<void>;
};

type AuthStatusResponse = {
  configured: boolean;
  authenticated: boolean;
  profile: GoogleProfile | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured,
    isAuthenticated,
    status,
    profile,
    error,
    signIn: () => {
      const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`);
    },
    signOut: async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      setIsAuthenticated(false);
      setProfile(null);
      setError(null);
      setStatus(isConfigured ? "ready" : "idle");
    },
    refreshStatus,
  }), [error, isAuthenticated, isConfigured, profile, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  async function refreshStatus() {
    setStatus((current) => (current === "authenticated" ? current : "loading"));
    try {
      const response = await fetch("/api/auth/status");
      if (!response.ok) {
        throw new Error(`Auth status failed (${response.status}).`);
      }

      const result = (await response.json()) as AuthStatusResponse;
      setIsConfigured(result.configured);
      setIsAuthenticated(result.authenticated);
      setProfile(result.profile ?? null);
      setError(null);
      setStatus(result.authenticated ? "authenticated" : result.configured ? "ready" : "idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load auth status.");
      setStatus("error");
    }
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
