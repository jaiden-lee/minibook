import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgressRecord } from "@minibook/shared-types";
import { NativePdfView } from "../components/NativePdfView";
import { openLocalBook, saveBookProgress } from "../lib/library";
import { mobileThemes, type AppearanceTheme } from "../theme";
import { getSetting, setSetting } from "../lib/database";

type ReaderScreenProps = {
  bookId: string;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onBack: () => void;
};

type ReaderState = {
  title: string;
  fileUri: string;
  totalPages: number;
  initialPage: number;
  currentPage: number;
  progress: ProgressRecord | null;
};

type PdfAppearance = "light" | "sepia" | "dark" | "darkContrast";
type MarginMode = "original" | "reduced";

const READER_PDF_APPEARANCE_KEY = "reader_pdf_appearance";
const READER_MARGIN_MODE_KEY = "reader_margin_mode";

export function ReaderScreen({ bookId, theme, onThemeChange, onBack }: ReaderScreenProps) {
  const [pdfAppearance, setPdfAppearance] = useState<PdfAppearance>(pdfAppearanceFallback(theme));
  const effectiveTheme = resolveThemeFromPdfAppearance(theme, pdfAppearance);
  const palette = mobileThemes[effectiveTheme];
  const jumpSequenceRef = useRef(0);
  const [state, setState] = useState<ReaderState | null>(null);
  const [pageJumpValue, setPageJumpValue] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerMessage, setViewerMessage] = useState<string | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [pendingPageJump, setPendingPageJump] = useState<{ page: number; id: number } | null>(null);
  const [marginMode, setMarginMode] = useState<MarginMode>("original");

  useEffect(() => {
    void loadBook();
  }, [bookId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });

    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    void loadReaderPreferences();
  }, []);

  useEffect(() => {
    void setSetting(READER_PDF_APPEARANCE_KEY, pdfAppearance);
  }, [pdfAppearance]);

  useEffect(() => {
    void setSetting(READER_MARGIN_MODE_KEY, marginMode);
  }, [marginMode]);

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
      setViewerMessage(null);
      const opened = await openLocalBook(bookId);
      const initialPage = opened.progress?.page ?? 1;
      setPageJumpValue(String(initialPage));
      setState({
        title: opened.book.title,
        fileUri: opened.fileUri,
        totalPages: Math.max(opened.progress?.page ?? 1, 1),
        initialPage,
        currentPage: initialPage,
        progress: opened.progress,
      });
      setPendingPageJump(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open this PDF on mobile.");
    } finally {
      setLoading(false);
    }
  }

  async function loadReaderPreferences() {
    const [savedAppearance, savedMarginMode] = await Promise.all([
      getSetting(READER_PDF_APPEARANCE_KEY),
      getSetting(READER_MARGIN_MODE_KEY),
    ]);

    if (savedAppearance === "light" || savedAppearance === "sepia" || savedAppearance === "dark" || savedAppearance === "darkContrast") {
      setPdfAppearance(savedAppearance);
      onThemeChange(resolveThemeFromPdfAppearance(theme, savedAppearance));
    } else if (theme === "slate") {
      setPdfAppearance("dark");
      onThemeChange("slate");
    } else if (theme === "sepia") {
      setPdfAppearance("sepia");
      onThemeChange("sepia");
    }

    if (savedMarginMode === "original" || savedMarginMode === "reduced") {
      setMarginMode(savedMarginMode);
    }
  }

  function moveRelative(delta: -1 | 1) {
    if (!state) {
      return;
    }

    const nextPage = Math.max(1, Math.min(state.totalPages || Number.MAX_SAFE_INTEGER, state.currentPage + delta));
    jumpSequenceRef.current += 1;
    setPageJumpValue(String(nextPage));
    setPendingPageJump({ page: nextPage, id: jumpSequenceRef.current });
  }

  function submitPageJump() {
    if (!state) {
      return;
    }

    const parsed = Number(pageJumpValue);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPageJumpValue(state ? String(state.currentPage) : "1");
      return;
    }

    const nextPage = Math.min(parsed, state.totalPages || parsed);
    jumpSequenceRef.current += 1;
    setPageJumpValue(String(nextPage));
    setPendingPageJump({ page: nextPage, id: jumpSequenceRef.current });
  }

  function cyclePdfAppearance() {
    setPdfAppearance((current) => {
      const next = (() => {
        switch (current) {
          case "light":
            return "sepia";
          case "sepia":
            return "dark";
          case "dark":
            return "darkContrast";
          default:
            return "light";
        }
      })();
      onThemeChange(resolveThemeFromPdfAppearance(theme, next));
      return next;
    });
  }

  function toggleMarginMode() {
    setMarginMode((current) => (current === "original" ? "reduced" : "original"));
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <StatusBar barStyle={effectiveTheme === "slate" ? "light-content" : "dark-content"} backgroundColor={palette.background} />
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
        <StatusBar barStyle={effectiveTheme === "slate" ? "light-content" : "dark-content"} backgroundColor={palette.background} />
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
  const chromeBackground = resolveChromeBackground(effectiveTheme, chromeHidden, palette.background, palette.surface);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: chromeBackground }]}>
        <StatusBar
        barStyle={effectiveTheme === "slate" ? "light-content" : "dark-content"}
        backgroundColor={chromeBackground}
        translucent={false}
      />
      <View style={[styles.topBar, { backgroundColor: `${palette.surface}EE` }, chromeHidden ? styles.topBarHidden : null]}>
        <Pressable onPress={onBack} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
          <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>Back</Text>
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={[styles.readerTitle, { color: palette.onSurface }]} numberOfLines={1}>{state.title}</Text>
          <Text style={[styles.readerMode, { color: palette.onSurfaceVariant }]}>Vertical local reading mode</Text>
        </View>

        <View style={styles.topBarActions}>
          <Pressable onPress={cyclePdfAppearance} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
            <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>{pdfAppearanceLabel(pdfAppearance)}</Text>
          </Pressable>
          <Pressable onPress={toggleMarginMode} style={[styles.chromeButton, { backgroundColor: palette.surfaceLow }]}>
            <Text style={[styles.chromeButtonLabel, { color: palette.onSurface }]}>
              {marginMode === "reduced" ? "Tight" : "Margins"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.readerCanvasWrap, { backgroundColor: palette.surfaceLow }]}>
        <NativePdfView
          fileUri={state.fileUri}
          theme={effectiveTheme}
          pdfAppearance={pdfAppearance}
          marginMode={marginMode}
          initialPage={state.initialPage}
          jumpRequest={pendingPageJump}
          onLoaded={(numberOfPages) => {
            setState((current) => (current ? {
              ...current,
              totalPages: numberOfPages,
            } : current));
          }}
          onPageChanged={(page, numberOfPages) => {
            setPageJumpValue(String(page));
            setPendingPageJump((current) => (current?.page === page ? null : current));
            setState((current) => (current ? {
              ...current,
              currentPage: page,
              totalPages: numberOfPages,
            } : current));
          }}
          onSingleTap={() => {
            setChromeHidden((current) => !current);
          }}
          onError={(message) => {
            setViewerMessage(message);
          }}
        />
      </View>

      <View style={[styles.footer, { backgroundColor: `${palette.surfaceHighest}F0` }, chromeHidden ? styles.footerHidden : null]}>
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

        {viewerMessage ? (
          <Text style={[styles.viewerMessage, { color: palette.onSurfaceVariant }]}>
            {viewerMessage}
          </Text>
        ) : null}

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

function resolveChromeBackground(
  _theme: AppearanceTheme,
  chromeHidden: boolean,
  hiddenColor: string,
  visibleColor: string,
) {
  if (chromeHidden) {
    return hiddenColor;
  }

  return visibleColor;
}

function resolveThemeFromPdfAppearance(fallbackTheme: AppearanceTheme, pdfAppearance: PdfAppearance): AppearanceTheme {
  switch (pdfAppearance) {
    case "sepia":
      return "sepia";
    case "dark":
    case "darkContrast":
      return "slate";
    case "light":
      return "light";
    default:
      return fallbackTheme;
  }
}

function pdfAppearanceFallback(theme: AppearanceTheme): PdfAppearance {
  switch (theme) {
    case "sepia":
      return "sepia";
    case "slate":
      return "dark";
    default:
      return "light";
  }
}

function pdfAppearanceLabel(mode: PdfAppearance) {
  switch (mode) {
    case "sepia":
      return "Sepia";
    case "dark":
      return "Dark";
    case "darkContrast":
      return "Contrast";
    default:
      return "Light";
  }
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
  topBarHidden: {
    display: "none",
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
  topBarActions: {
    flexDirection: "row",
    gap: 8,
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
  footerHidden: {
    display: "none",
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
  viewerMessage: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
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
