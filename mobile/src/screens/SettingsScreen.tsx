import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { BottomBar } from "../components/BottomBar";
import {
  clearStoredMobileGoogleSession,
  createMobileGoogleSessionFromTokens,
  exchangeGoogleCodeAsync,
  getGoogleClientIdForPlatform,
  getGoogleDriveScope,
  storeMobileGoogleSession,
  type MobileGoogleAuthSession,
} from "../lib/auth";
import { mobileThemes, type AppearanceTheme } from "../theme";

WebBrowser.maybeCompleteAuthSession();

type SettingsScreenProps = {
  theme: AppearanceTheme;
  googleSession: MobileGoogleAuthSession | null;
  onGoogleSessionChange: (session: MobileGoogleAuthSession | null) => void;
  onGoogleSignOut: () => void;
  onThemeChange: (theme: AppearanceTheme) => void;
  onBackToLibrary: () => void;
};

export function SettingsScreen({
  theme,
  googleSession,
  onGoogleSessionChange,
  onGoogleSignOut,
  onThemeChange,
  onBackToLibrary,
}: SettingsScreenProps) {
  const palette = mobileThemes[theme];
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const googleClientId = useMemo(() => {
    try {
      return getGoogleClientIdForPlatform();
    } catch {
      return null;
    }
  }, []);
  const discovery = AuthSession.useAutoDiscovery("https://accounts.google.com");
  const redirectUri = useMemo(() => AuthSession.makeRedirectUri({
    scheme: "minibook",
    path: "oauth",
  }), []);
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId ?? "missing-google-client-id",
      redirectUri,
      scopes: ["openid", "profile", "email", getGoogleDriveScope()],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
    discovery,
  );

  useEffect(() => {
    if (!response || response.type !== "success" || !googleClientId || !request?.codeVerifier) {
      if (response?.type === "error") {
        setAuthError(response.error?.message ?? "Google sign-in failed.");
      }
      return;
    }

    const code = response.params.code;
    if (!code) {
      setAuthError("Google did not return an authorization code.");
      return;
    }

    void completeGoogleSignIn({
      clientId: googleClientId,
      code,
      codeVerifier: request.codeVerifier,
      redirectUri,
      onGoogleSessionChange,
      setAuthBusy,
      setAuthError,
    });
  }, [googleClientId, onGoogleSessionChange, redirectUri, request?.codeVerifier, response]);

  async function handleGoogleSignIn() {
    if (!request) {
      setAuthError("Google auth is not configured for this platform yet.");
      return;
    }

    setAuthError(null);
    const result = await promptAsync();
    if (result.type === "dismiss" || result.type === "cancel") {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignOut() {
    setAuthError(null);
    await clearStoredMobileGoogleSession();
    onGoogleSignOut();
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>Atmosphere</Text>
        <Text style={[styles.title, { color: palette.onSurface }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]}>
          Refining your sanctuary for local reading before Google auth and sync arrive on mobile.
        </Text>

        <View style={[styles.section, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.sectionTitle, { color: palette.onSurfaceVariant }]}>Theme</Text>
          {(["light", "sepia", "slate"] as AppearanceTheme[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => onThemeChange(option)}
              style={[
                styles.optionRow,
                {
                  backgroundColor: theme === option ? palette.surfaceHighest : palette.surfaceLowest,
                },
              ]}
            >
              <Text style={[styles.optionTitle, { color: palette.onSurface }]}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </Text>
              <Text style={[styles.optionCopy, { color: palette.onSurfaceVariant }]}>
                {option === "light"
                  ? "Soft paper tones for daytime reading."
                  : option === "sepia"
                    ? "Warm vellum contrast for long sessions."
                    : "A deep charcoal reading shell for darker rooms."}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.sectionTitle, { color: palette.onSurfaceVariant }]}>Google Drive Sync</Text>
          {googleSession ? (
            <>
              <View style={[styles.authCard, { backgroundColor: palette.surfaceLowest }]}>
                <Text style={[styles.optionTitle, { color: palette.onSurface }]}>
                  {googleSession.accountName ?? "Google account connected"}
                </Text>
                <Text style={[styles.optionCopy, { color: palette.onSurfaceVariant }]}>
                  {googleSession.accountEmail ?? "Drive sync is ready for the next mobile phase."}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleGoogleSignOut()}
                style={[styles.authButton, { backgroundColor: palette.surfaceHighest }]}
              >
                <Text style={[styles.authButtonLabel, { color: palette.onSurface }]}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.optionCopy, { color: palette.onSurfaceVariant, marginBottom: 12 }]}>
                Sign in now so mobile can reuse the same Google Drive progress sync model as web.
              </Text>
              <Pressable
                disabled={!request || authBusy || !googleClientId}
                onPress={() => void handleGoogleSignIn()}
                style={[
                  styles.authButton,
                  { backgroundColor: palette.primary },
                  (!request || authBusy || !googleClientId) ? styles.authButtonDisabled : null,
                ]}
              >
                <Text style={[styles.authButtonLabel, { color: palette.onPrimary }]}>
                  {authBusy ? "Connecting..." : "Sign in with Google"}
                </Text>
              </Pressable>
              {!googleClientId ? (
                <Text style={[styles.authHint, { color: palette.onSurfaceVariant }]}>
                  Add the mobile Google OAuth client ID env vars before testing auth.
                </Text>
              ) : null}
            </>
          )}

          {authError ? (
            <Text style={[styles.authError, { color: palette.primary }]}>
              {authError}
            </Text>
          ) : null}
        </View>

        <View style={[styles.section, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.sectionTitle, { color: palette.onSurfaceVariant }]}>Roadmap for this mobile pass</Text>
          {[
            "Import PDFs into app-local storage",
            "Render local PDFs with a mobile PDF.js viewer",
            "Save and restore local reading progress",
            "Match the web app's editorial feel on mobile",
            "Connect Google auth before Drive sync",
          ].map((item) => (
            <View key={item} style={styles.checkRow}>
              <View style={[styles.dot, { backgroundColor: palette.primary }]} />
              <Text style={[styles.checkCopy, { color: palette.onSurface }]}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <BottomBar activeTab="settings" theme={theme} onSelect={(tab) => {
        if (tab === "library") {
          onBackToLibrary();
        }
      }} />
    </View>
  );
}

async function completeGoogleSignIn({
  clientId,
  code,
  codeVerifier,
  redirectUri,
  onGoogleSessionChange,
  setAuthBusy,
  setAuthError,
}: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  onGoogleSessionChange: (session: MobileGoogleAuthSession | null) => void;
  setAuthBusy: (busy: boolean) => void;
  setAuthError: (message: string | null) => void;
}) {
  setAuthBusy(true);
  setAuthError(null);

  try {
    const tokenResponse = await exchangeGoogleCodeAsync({
      clientId,
      code,
      codeVerifier,
      redirectUri,
    });
    const session = await createMobileGoogleSessionFromTokens(tokenResponse);
    await storeMobileGoogleSession(session);
    onGoogleSessionChange(session);
  } catch (caught) {
    setAuthError(caught instanceof Error ? caught.message : "Google sign-in failed.");
  } finally {
    setAuthBusy(false);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 132,
  },
  kicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 34,
    letterSpacing: -1.4,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 24,
    fontFamily: "Newsreader_400Regular",
    fontSize: 20,
    lineHeight: 30,
  },
  section: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 14,
  },
  optionRow: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  optionTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 16,
    marginBottom: 4,
  },
  optionCopy: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 17,
    lineHeight: 25,
  },
  authCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  authButton: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authButtonLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  authHint: {
    marginTop: 10,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  authError: {
    marginTop: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  checkCopy: {
    flex: 1,
    fontFamily: "Newsreader_400Regular",
    fontSize: 18,
    lineHeight: 27,
  },
});
