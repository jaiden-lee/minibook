import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getGoogleClientId } from "@/lib/env";

type AuthStatus = "idle" | "loading" | "ready" | "authorizing" | "authenticated" | "error";

type GoogleProfile = {
  name?: string;
  email?: string;
  picture?: string;
};

type AuthContextValue = {
  isConfigured: boolean;
  status: AuthStatus;
  accessToken: string | null;
  profile: GoogleProfile | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse & { error?: string; error_description?: string }) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SCRIPT_ID = "minibook-gis-script";
const AUTH_STORAGE_KEY = "minibook:google-auth";

type StoredAuthSession = {
  accessToken: string;
  expiresAt: number;
  profile: GoogleProfile | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const clientId = getGoogleClientId();
  const [storedSession, setStoredSession] = useState<StoredAuthSession | null>(() => readStoredAuthSession());
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (!clientId) {
      return "idle";
    }

    return storedSession ? "authenticated" : "loading";
  });
  const [accessToken, setAccessToken] = useState<string | null>(storedSession?.accessToken ?? null);
  const [profile, setProfile] = useState<GoogleProfile | null>(storedSession?.profile ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<GoogleTokenClient | null>(null);

  useEffect(() => {
    if (!clientId) {
      setStatus("idle");
      clearStoredAuthSession();
      setStoredSession(null);
      return;
    }

    let cancelled = false;

    async function initialize() {
      if (!clientId) {
        return;
      }

      try {
        await loadGoogleIdentityScript();
        if (cancelled || !window.google?.accounts.oauth2) {
          return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              setStatus("error");
              setError(response.error_description ?? response.error ?? "Google sign-in failed.");
              return;
            }

            setAccessToken(response.access_token);
            setError(null);
            setStatus("authenticated");
            void loadGoogleProfile(response.access_token)
              .then((nextProfile) => {
                setProfile(nextProfile);
                writeStoredAuthSession({
                  accessToken: response.access_token,
                  expiresAt: Date.now() + Math.max(1, response.expires_in ?? 3600) * 1000,
                  profile: nextProfile,
                });
                setStoredSession(readStoredAuthSession());
              })
              .catch((caught) => {
                setProfile(null);
                setError(caught instanceof Error ? caught.message : "Unable to load Google profile.");
                writeStoredAuthSession({
                  accessToken: response.access_token,
                  expiresAt: Date.now() + Math.max(1, response.expires_in ?? 3600) * 1000,
                  profile: null,
                });
                setStoredSession(readStoredAuthSession());
              });
          },
          error_callback: (callbackError) => {
            setStatus("error");
            setError(callbackError.message ?? callbackError.type ?? "Google sign-in failed.");
          },
        });

        setTokenClient(client);
        setStatus((current) => (storedSession ? "authenticated" : current === "authenticated" ? current : "ready"));
      } catch (caught) {
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Unable to load Google Identity Services.");
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [clientId, storedSession]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const activeSession = readStoredAuthSession();
    if (!activeSession) {
      return;
    }

    const remaining = activeSession.expiresAt - Date.now();
    if (remaining <= 0) {
      clearStoredAuthSession();
      setStoredSession(null);
      setAccessToken(null);
      setProfile(null);
      setStatus(clientId ? "ready" : "idle");
      return;
    }

    const timeout = window.setTimeout(() => {
      clearStoredAuthSession();
      setStoredSession(null);
      setAccessToken(null);
      setProfile(null);
      setStatus(clientId ? "ready" : "idle");
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [accessToken, clientId]);

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured: clientId !== null,
    status,
    accessToken,
    profile,
    error,
    signIn: () => {
      if (!tokenClient) {
        return;
      }

      setError(null);
      setStatus("authorizing");
      tokenClient.requestAccessToken({
        prompt: accessToken ? "" : "consent",
      });
    },
    signOut: () => {
      if (accessToken && window.google?.accounts.oauth2) {
        window.google.accounts.oauth2.revoke(accessToken, () => undefined);
      }

      clearStoredAuthSession();
      setStoredSession(null);
      setAccessToken(null);
      setProfile(null);
      setError(null);
      setStatus(clientId ? "ready" : "idle");
    },
  }), [accessToken, clientId, error, profile, status, tokenClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}

async function loadGoogleIdentityScript() {
  if (window.google?.accounts.oauth2) {
    return;
  }

  const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    await waitForGoogleIdentity();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Google Identity Services."));
    document.head.appendChild(script);
  });

  await waitForGoogleIdentity();
}

async function waitForGoogleIdentity() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (window.google?.accounts.oauth2) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  throw new Error("Google Identity Services did not initialize.");
}

async function loadGoogleProfile(accessToken: string): Promise<GoogleProfile | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load your Google profile.");
  }

  const result = (await response.json()) as GoogleProfile;
  return result;
}

function readStoredAuthSession(): StoredAuthSession | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > Date.now()
    ) {
      return {
        accessToken: parsed.accessToken,
        expiresAt: parsed.expiresAt,
        profile: parsed.profile ?? null,
      };
    }
  } catch {
    // ignore invalid local auth state
  }

  clearStoredAuthSession();
  return null;
}

function writeStoredAuthSession(session: StoredAuthSession) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
