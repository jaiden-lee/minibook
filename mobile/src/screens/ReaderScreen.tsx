import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgressRecord } from "@minibook/shared-types";
import { NativePdfView } from "../components/NativePdfView";
import { openLocalBook, saveBookProgress } from "../lib/library";
import { mobileThemes, type AppearanceTheme } from "../theme";

type ReaderScreenProps = {
  bookId: string;
  theme: AppearanceTheme;
  onBack: () => void;
};

type ReaderState = {
  title: string;
  fileUri: string;
  totalPages: number;
  currentPage: number;
  progress: ProgressRecord | null;
};

export function ReaderScreen({ bookId, theme, onBack }: ReaderScreenProps) {
  const palette = mobileThemes[theme];
  const [state, setState] = useState<ReaderState | null>(null);
  const [pageJumpValue, setPageJumpValue] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadBook();
  }, [bookId]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const timeout = setTimeout(() => {
      void saveBookProgress(bookId, state.currentPage, state.totalPages, 0, state.progress).then((progress) => {
        setState((current) => (current ? { ...current, progress } : current));
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [bookId, state?.currentPage, state?.totalPages]);

  async function loadBook() {
    try {
      setLoading(true);
      setError(null);
      const opened = await openLocalBook(bookId);
      const initialPage = opened.progress?.page ?? 1;
      setPageJumpValue(String(initialPage));
      setState({
        title: opened.book.title,
        fileUri: opened.fileUri,
        totalPages: Math.max(opened.progress?.page ?? 1, 1),
        currentPage: initialPage,
        progress: opened.progress,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open this PDF on mobile.");
    } finally {
      setLoading(false);
    }
  }

  function moveRelative(delta: -1 | 1) {
    setState((current) => {
      if (!current) {
        return current;
      }

      const nextPage = Math.max(1, current.currentPage + delta);
      setPageJumpValue(String(nextPage));
      return {
        ...current,
        currentPage: nextPage,
        totalPages: Math.max(current.totalPages, nextPage),
      };
    });
  }

  function submitPageJump() {
    const parsed = Number(pageJumpValue);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPageJumpValue(state ? String(state.currentPage) : "1");
      return;
    }

    setState((current) => (
      current
        ? {
            ...current,
            currentPage: parsed,
            totalPages: Math.max(current.totalPages, parsed),
          }
        : current
    ));
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingTitle, { color: palette.onSurface }]}>Opening book</Text>
          <Text style={[styles.loadingCopy, { color: palette.onSurfaceVariant }]}>Preparing your local reading view.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !state) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.loadingTitle, { color: palette.onSurface }]}>Reader unavailable</Text>
          <Text style={[styles.loadingCopy, { color: palette.onSurfaceVariant }]}>{error ?? "Unknown reader error."}</Text>
          <Pressable style={[styles.backButton, { backgroundColor: palette.primary }]} onPress={onBack}>
            <Text style={[styles.backButtonLabel, { color: palette.onPrimary }]}>Return to library</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const percent = Math.round((state.currentPage / Math.max(state.totalPages, 1)) * 100);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={[styles.topBar, { backgroundColor: `${palette.surface}EE` }]}>
        <Pressable onPress={onBack} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>Back</Text>
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={[styles.readerTitle, { color: palette.onSurface }]} numberOfLines={1}>{state.title}</Text>
          <Text style={[styles.readerMode, { color: palette.onSurfaceVariant }]}>Vertical local reading mode</Text>
        </View>
      </View>

      <View style={[styles.readerCanvasWrap, { backgroundColor: palette.surfaceLow }]}>
        <NativePdfView fileUri={state.fileUri} theme={theme} />
      </View>

      <View style={[styles.footer, { backgroundColor: `${palette.surfaceHighest}F0` }]}>
        <View style={styles.footerRow}>
          <View>
            <Text style={[styles.progressKicker, { color: palette.onSurfaceVariant }]}>Progress</Text>
            <Text style={[styles.progressTitle, { color: palette.onSurface }]}>
              Page {state.currentPage} <Text style={{ color: palette.onSurfaceVariant }}>of {state.totalPages}</Text>
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={() => moveRelative(-1)} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
              <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>Prev</Text>
            </Pressable>
            <Pressable onPress={() => moveRelative(1)} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
              <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>Next</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.progressLine, { backgroundColor: `${palette.outline}30` }]}>
          <View style={[styles.progressLineFill, { backgroundColor: palette.primary, width: `${percent}%` }]} />
        </View>

        <View style={[styles.pageJumpWrap, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.pageJumpLabel, { color: palette.onSurfaceVariant }]}>Jump to page</Text>
          <TextInput
            keyboardType="number-pad"
            value={pageJumpValue}
            onChangeText={setPageJumpValue}
            style={[styles.pageJumpInput, { color: palette.onSurface }]}
          />
          <Pressable onPress={submitPageJump} style={[styles.jumpButton, { backgroundColor: palette.primary }]}>
            <Text style={[styles.jumpButtonLabel, { color: palette.onPrimary }]}>Go</Text>
          </Pressable>
        </View>
      </View>
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
  backButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
  },
  backButtonLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  chromeButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chromeButtonLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  titleWrap: {
    flex: 1,
  },
  readerTitle: {
    fontFamily: "Newsreader_400Regular_Italic",
    fontSize: 20,
  },
  readerMode: {
    marginTop: 2,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  readerCanvasWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 16,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  progressKicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  progressTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 24,
    letterSpacing: -0.8,
  },
  progressLine: {
    height: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressLineFill: {
    height: "100%",
  },
  pageJumpWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pageJumpLabel: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  pageJumpInput: {
    width: 60,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  jumpButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  jumpButtonLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
});
