import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from "@expo-google-fonts/inter";
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { Newsreader_400Regular, Newsreader_500Medium, Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader";
import type { BookRecord, ProgressRecord } from "@minibook/shared-types";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { ReaderScreen } from "./src/screens/ReaderScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ensureDatabase, getSetting, listLibraryBooks, setSetting } from "./src/lib/database";
import { AppearanceTheme, mobileThemes } from "./src/theme";

type AppTab = "library" | "settings";

export type MobileLibraryBook = {
  book: BookRecord;
  progress?: ProgressRecord;
};

const APP_THEME_KEY = "app_theme";

export default function App() {
  const [theme, setTheme] = useState<AppearanceTheme>("light");
  const [tab, setTab] = useState<AppTab>("library");
  const [books, setBooks] = useState<MobileLibraryBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
  });
  const palette = useMemo(() => mobileThemes[theme], [theme]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    void setSetting(APP_THEME_KEY, theme);
  }, [theme]);

  async function bootstrap() {
    try {
      setError(null);
      await ensureDatabase();
      const savedTheme = await getSetting(APP_THEME_KEY);
      if (savedTheme === "light" || savedTheme === "sepia" || savedTheme === "slate") {
        setTheme(savedTheme);
      }
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare the mobile library.");
    } finally {
      setBooting(false);
    }
  }

  async function refreshLibrary() {
    setBooks(await listLibraryBooks());
  }

  if (!fontsLoaded || booting) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <StatusBar
          barStyle={theme === "slate" ? "light-content" : "dark-content"}
          backgroundColor={palette.background}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingTitle, { color: palette.onBackground }]}>Preparing minibook</Text>
          <Text style={[styles.loadingCopy, { color: palette.onSurfaceVariant }]}>Assembling your quiet local library.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <StatusBar
          barStyle={theme === "slate" ? "light-content" : "dark-content"}
          backgroundColor={palette.background}
        />
        <View style={styles.centered}>
          <Text style={[styles.loadingTitle, { color: palette.onBackground }]}>Mobile library unavailable</Text>
          <Text style={[styles.loadingCopy, { color: palette.onSurfaceVariant }]}>{error}</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: palette.primary }]} onPress={() => void bootstrap()}>
            <Text style={[styles.primaryButtonLabel, { color: palette.onPrimary }]}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedBookId) {
    return (
      <ReaderScreen
        bookId={selectedBookId}
        theme={theme}
        onBack={() => {
          setSelectedBookId(null);
          void refreshLibrary();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={theme === "slate" ? "light-content" : "dark-content"}
        backgroundColor={palette.background}
      />
      {tab === "library" ? (
        <LibraryScreen
          books={books}
          theme={theme}
          onOpenBook={(bookId) => setSelectedBookId(bookId)}
          onLibraryChanged={() => void refreshLibrary()}
          onOpenSettings={() => setTab("settings")}
        />
      ) : (
        <SettingsScreen
          theme={theme}
          onBackToLibrary={() => setTab("library")}
          onThemeChange={setTheme}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingTitle: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 28,
    letterSpacing: -1,
  },
  loadingCopy: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 18,
    lineHeight: 28,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
  },
  primaryButtonLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
  },
});
