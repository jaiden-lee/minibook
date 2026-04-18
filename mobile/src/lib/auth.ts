import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
  type User,
} from "@react-native-google-signin/google-signin";

const AUTH_SESSION_KEY = "google_auth_session";

export type MobileGoogleAuthSession = {
  accountEmail: string | null;
  accountName: string | null;
  accountPicture: string | null;
  idToken: string | null;
  grantedScopes: string[];
  lastAccessToken: string | null;
  lastTokenAt: number | null;
};

let configured = false;

export function configureMobileGoogleSignin() {
  if (configured) {
    return;
  }

  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: [getGoogleDriveScope()],
    offlineAccess: true,
    forceCodeForRefreshToken: false,
  });

  configured = true;
}

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

export function validateMobileGoogleAuthConfig() {
  const missing: string[] = [];

  if (!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
    missing.push("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID");
  }
  if (!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
    missing.push("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID");
  }
  if (!process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME) {
    missing.push("EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME");
  }
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    missing.push("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
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

export async function restoreMobileGoogleSession() {
  configureMobileGoogleSignin();

  try {
    const response = await GoogleSignin.signInSilently();
    if (response.type === "success") {
      const tokens = await GoogleSignin.getTokens();
      const session = mapGoogleUserToSession(response.data, tokens.accessToken);
      await storeMobileGoogleSession(session);
      return session;
    }

    if (response.type === "noSavedCredentialFound") {
      await clearStoredMobileGoogleSession();
      return null;
    }
  } catch (caught) {
    if (isErrorWithCode(caught) && caught.code === statusCodes.SIGN_IN_REQUIRED) {
      await clearStoredMobileGoogleSession();
      return null;
    }

    throw caught;
  }

  return null;
}

export async function signInWithGoogle() {
  configureMobileGoogleSignin();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    return null;
  }

  const tokens = await GoogleSignin.getTokens();
  const session = mapGoogleUserToSession(response.data, tokens.accessToken);
  await storeMobileGoogleSession(session);
  return session;
}

export async function signOutGoogle() {
  configureMobileGoogleSignin();
  await GoogleSignin.signOut();
  await clearStoredMobileGoogleSession();
}

export async function revokeGoogleAccess() {
  configureMobileGoogleSignin();
  await GoogleSignin.revokeAccess();
  await GoogleSignin.signOut();
  await clearStoredMobileGoogleSession();
}

export async function getValidMobileGoogleAccessToken() {
  configureMobileGoogleSignin();

  const tokens = await GoogleSignin.getTokens();
  const currentUser = GoogleSignin.getCurrentUser();
  if (currentUser) {
    const session = mapGoogleUserToSession(currentUser, tokens.accessToken);
    await storeMobileGoogleSession(session);
  }

  return tokens.accessToken;
}

function mapGoogleUserToSession(user: User, accessToken: string | null): MobileGoogleAuthSession {
  return {
    accountEmail: user.user.email ?? null,
    accountName: user.user.name ?? null,
    accountPicture: user.user.photo ?? null,
    idToken: user.idToken ?? null,
    grantedScopes: user.scopes ?? [],
    lastAccessToken: accessToken,
    lastTokenAt: accessToken ? Date.now() : null,
  };
}
