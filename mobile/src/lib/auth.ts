import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const AUTH_SESSION_KEY = "google_auth_session";

export type MobileGoogleAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  tokenType: string | null;
  accountEmail: string | null;
  accountName: string | null;
  accountPicture: string | null;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
  picture?: string;
};

export function getGoogleClientIdForPlatform() {
  const clientId = Platform.select({
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    default: undefined,
  });

  if (!clientId) {
    throw new Error("Missing Google OAuth client ID for this mobile platform.");
  }

  return clientId;
}

export function getGoogleDriveScope() {
  return process.env.EXPO_PUBLIC_GOOGLE_DRIVE_SCOPE || "https://www.googleapis.com/auth/drive.file";
}

export async function getStoredMobileGoogleSession() {
  const raw = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MobileGoogleAuthSession;
  } catch {
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
    return null;
  }
}

export async function storeMobileGoogleSession(session: MobileGoogleAuthSession) {
  await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredMobileGoogleSession() {
  await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
}

export async function exchangeGoogleCodeAsync({
  clientId,
  code,
  codeVerifier,
  redirectUri,
}: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = await response.json() as GoogleTokenResponse | { error?: string; error_description?: string };
  if (!response.ok || !("access_token" in payload)) {
    throw new Error(("error_description" in payload && payload.error_description) || "Google token exchange failed.");
  }

  return payload;
}

export async function refreshGoogleAccessTokenAsync({
  clientId,
  refreshToken,
}: {
  clientId: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = await response.json() as GoogleTokenResponse | { error?: string; error_description?: string };
  if (!response.ok || !("access_token" in payload)) {
    throw new Error(("error_description" in payload && payload.error_description) || "Google access token refresh failed.");
  }

  return payload;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load Google account profile.");
  }

  return response.json() as Promise<GoogleUserInfo>;
}

export async function createMobileGoogleSessionFromTokens(tokenResponse: GoogleTokenResponse) {
  const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? null,
    idToken: tokenResponse.id_token ?? null,
    expiresAt: tokenResponse.expires_in
      ? Date.now() + (tokenResponse.expires_in * 1000)
      : null,
    scope: tokenResponse.scope ?? null,
    tokenType: tokenResponse.token_type ?? null,
    accountEmail: userInfo.email ?? null,
    accountName: userInfo.name ?? null,
    accountPicture: userInfo.picture ?? null,
  } satisfies MobileGoogleAuthSession;
}

export function isGoogleSessionExpired(session: MobileGoogleAuthSession | null) {
  if (!session?.expiresAt) {
    return true;
  }

  return session.expiresAt <= (Date.now() + 60_000);
}

export async function getValidMobileGoogleSession(session: MobileGoogleAuthSession | null) {
  if (!session) {
    return null;
  }

  if (!isGoogleSessionExpired(session)) {
    return session;
  }

  if (!session.refreshToken) {
    return null;
  }

  const refreshedTokens = await refreshGoogleAccessTokenAsync({
    clientId: getGoogleClientIdForPlatform(),
    refreshToken: session.refreshToken,
  });

  const refreshedSession = {
    ...session,
    accessToken: refreshedTokens.access_token,
    expiresAt: refreshedTokens.expires_in
      ? Date.now() + (refreshedTokens.expires_in * 1000)
      : session.expiresAt,
    idToken: refreshedTokens.id_token ?? session.idToken,
    scope: refreshedTokens.scope ?? session.scope,
    tokenType: refreshedTokens.token_type ?? session.tokenType,
  } satisfies MobileGoogleAuthSession;

  await storeMobileGoogleSession(refreshedSession);
  return refreshedSession;
}
