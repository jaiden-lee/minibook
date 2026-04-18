import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomBar } from "../components/BottomBar";
import {
  revokeGoogleAccess,
  signInWithGoogle,
  signOutGoogle,
  type MobileGoogleAuthSession,
  validateMobileGoogleAuthConfig,
} from "../lib/auth";
import { mobileThemes, type AppearanceTheme } from "../theme";

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
  const authConfig = validateMobileGoogleAuthConfig();

  async function handleGoogleSignIn() {
    setAuthBusy(true);
    setAuthError(null);

    try {
      const session = await signInWithGoogle();
      if (session) {
        onGoogleSessionChange(session);
      }
    } catch (caught) {
      console.log("[minibook mobile auth] sign-in error", caught);
      setAuthError(formatAuthError(caught));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignOut() {
    setAuthBusy(true);
    setAuthError(null);

    try {
      await signOutGoogle();
      onGoogleSignOut();
    } catch (caught) {
      console.log("[minibook mobile auth] sign-out error", caught);
      setAuthError(formatAuthError(caught));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleDisconnect() {
    setAuthBusy(true);
    setAuthError(null);

    try {
      await revokeGoogleAccess();
      onGoogleSignOut();
    } catch (caught) {
      console.log("[minibook mobile auth] revoke-access error", caught);
      setAuthError(formatAuthError(caught));
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>Atmosphere</Text>
        <Text style={[styles.title, { color: palette.onSurface }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]}>
          Refining your sanctuary for local reading before Google Drive sync arrives on mobile.
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
                  {googleSession.accountEmail ?? "Signed in and ready for Drive sync."}
                </Text>
              </View>
              <View style={styles.authActions}>
                <Pressable
                  onPress={() => void handleGoogleSignOut()}
                  style={[styles.authButton, { backgroundColor: palette.surfaceHighest }]}
                >
                  <Text style={[styles.authButtonLabel, { color: palette.onSurface }]}>Sign out</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleGoogleDisconnect()}
                  style={[styles.authButton, { backgroundColor: palette.surfaceHighest }]}
                >
                  <Text style={[styles.authButtonLabel, { color: palette.onSurface }]}>Disconnect</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.optionCopy, { color: palette.onSurfaceVariant, marginBottom: 12 }]}>
                Sign in now so mobile can reuse the same Google Drive progress sync model as web, without the broken browser redirect flow.
              </Text>
              <Pressable
                disabled={!authConfig.valid || authBusy}
                onPress={() => void handleGoogleSignIn()}
                style={[
                  styles.authButton,
                  { backgroundColor: palette.primary },
                  (!authConfig.valid || authBusy) ? styles.authButtonDisabled : null,
                ]}
              >
                <Text style={[styles.authButtonLabel, { color: palette.onPrimary }]}>
                  {authBusy ? "Connecting..." : "Sign in with Google"}
                </Text>
              </Pressable>
              {!authConfig.valid ? (
                <Text style={[styles.authHint, { color: palette.onSurfaceVariant }]}>
                  Missing mobile auth env vars: {authConfig.missing.join(", ")}
                </Text>
              ) : null}
            </>
          )}

          <Text style={[styles.authHint, { color: palette.onSurfaceVariant }]}>
            Native sign-in manages the mobile Google session. For Drive calls, the app requests fresh access tokens from the native Google SDK instead of using the broken custom-scheme browser flow.
          </Text>

          {authError ? (
            <Text style={[styles.authError, { color: palette.primary }]}>
              {authError}
            </Text>
          ) : null}
        </View>

        <View style={[styles.section, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.sectionTitle, { color: palette.onSurfaceVariant }]}>Roadmap for this mobile pass</Text>
          {[
            "Index PDFs from the Android library folder",
            "Render local PDFs with a mobile PDF.js viewer",
            "Save and restore local reading progress",
            "Match the web app's editorial feel on mobile",
            "Use native Google sign-in before Drive sync",
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

function formatAuthError(caught: unknown) {
  if (!caught || typeof caught !== "object") {
    return "Google auth failed.";
  }

  const error = caught as {
    code?: string;
    message?: string;
    nativeErrorCode?: string;
    userInfo?: unknown;
  };

  const pieces = [
    error.code,
    error.nativeErrorCode,
    error.message,
  ].filter((piece): piece is string => typeof piece === "string" && piece.length > 0);

  if ("userInfo" in error && error.userInfo) {
    try {
      pieces.push(JSON.stringify(error.userInfo));
    } catch {
      // ignore non-serializable metadata
    }
  }

  return pieces.length > 0 ? pieces.join(" | ") : "Google auth failed.";
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
  authActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  authButton: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
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
