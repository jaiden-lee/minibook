import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { MobileLibraryBook } from "../../App";
import { BottomBar } from "../components/BottomBar";
import { BookCard } from "../components/BookCard";
import { chooseAndroidLibraryDirectory, getAndroidLibraryDirectoryUri, importPdfFromDevice, indexAndroidLibraryDirectory } from "../lib/library";
import { mobileThemes, type AppearanceTheme } from "../theme";

type LibraryScreenProps = {
  books: MobileLibraryBook[];
  theme: AppearanceTheme;
  onOpenBook: (bookId: string) => void;
  onLibraryChanged: () => void;
  onOpenSettings: () => void;
};

export function LibraryScreen({
  books,
  theme,
  onOpenBook,
  onLibraryChanged,
  onOpenSettings,
}: LibraryScreenProps) {
  const palette = mobileThemes[theme];
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [libraryDirectoryUri, setLibraryDirectoryUri] = useState<string | null>(null);

  useEffect(() => {
    void getAndroidLibraryDirectoryUri().then(setLibraryDirectoryUri);
  }, []);
  const filteredBooks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return books;
    }

    return books.filter(({ book }) => {
      const haystack = [book.title, book.original_filename, book.local_path].join("\n").toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [books, query]);

  async function handleImport() {
    setBusy(true);
    try {
      const imported = await importPdfFromDevice();
      if (imported) {
        onLibraryChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseFolder() {
    setBusy(true);
    try {
      const uri = await chooseAndroidLibraryDirectory();
      if (uri) {
        setLibraryDirectoryUri(uri);
        await indexAndroidLibraryDirectory(uri);
        onLibraryChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>minibook</Text>
            <Text style={[styles.title, { color: palette.onSurface }]}>My Library</Text>
          </View>

          <Pressable style={[styles.settingsBubble, { backgroundColor: palette.surfaceHigh }]} onPress={onOpenSettings}>
            <Text style={[styles.settingsBubbleLabel, { color: palette.onSurfaceVariant }]}>Settings</Text>
          </Pressable>
        </View>

        <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]}>
          Continue through your local shelves. PDFs stay on the device, and progress stays ready for sync later.
        </Text>

        {Platform.OS === "android" ? (
          <View style={[styles.directoryBanner, { backgroundColor: palette.surfaceLow }]}>
            <View style={styles.directoryCopy}>
              <Text style={[styles.directoryTitle, { color: palette.onSurface }]}>Library folder</Text>
              <Text style={[styles.directoryPath, { color: palette.onSurfaceVariant }]} numberOfLines={2}>
                {libraryDirectoryUri ?? "Choose an Android folder instead of duplicating PDFs into app storage."}
              </Text>
            </View>
            <Pressable
              style={[styles.directoryButton, { backgroundColor: palette.surfaceHighest }]}
              onPress={() => void handleChooseFolder()}
            >
              <Text style={[styles.directoryButtonLabel, { color: palette.onSurface }]}>
                {libraryDirectoryUri ? "Reindex" : "Choose Folder"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.searchWrap, { backgroundColor: palette.surfaceLow }]}>
          <TextInput
            placeholder="Search title, filename, or path..."
            placeholderTextColor={palette.onSurfaceVariant}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: palette.onSurface }]}
          />
        </View>

        <View style={styles.grid}>
          {filteredBooks.map((item) => (
            <BookCard key={item.book.book_id} item={item} theme={theme} onPress={() => onOpenBook(item.book.book_id)} />
          ))}

          {!(Platform.OS === "android" && libraryDirectoryUri) ? (
            <Pressable
              onPress={() => void handleImport()}
              style={[styles.importCard, { backgroundColor: palette.surfaceLow, borderColor: `${palette.outline}30` }]}
            >
              <View style={styles.importCardInner}>
                <Text style={[styles.importGlyph, { color: palette.primary }]}>+</Text>
                <Text style={[styles.importLabel, { color: palette.onSurface }]}>
                  {busy ? "Working..." : Platform.OS === "android" ? "Import One PDF" : "Import PDF"}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {!filteredBooks.length ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surfaceLow }]}>
            <Text style={[styles.emptyTitle, { color: palette.onSurface }]}>No books match this search.</Text>
            <Text style={[styles.emptyCopy, { color: palette.onSurfaceVariant }]}>
              Try a different title, filename, or path fragment.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <BottomBar activeTab="library" theme={theme} onSelect={(tab) => {
        if (tab === "settings") {
          onOpenSettings();
        }
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 132,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
    marginBottom: 18,
    fontFamily: "Newsreader_400Regular",
    fontSize: 20,
    lineHeight: 30,
  },
  directoryBanner: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 18,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  directoryCopy: {
    flex: 1,
  },
  directoryTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    marginBottom: 4,
  },
  directoryPath: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 16,
    lineHeight: 22,
  },
  directoryButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  directoryButtonLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  settingsBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  settingsBubbleLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  searchWrap: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  searchInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  importCard: {
    width: "47%",
    aspectRatio: 0.68,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  importCardInner: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  importGlyph: {
    fontFamily: "Newsreader_500Medium",
    fontSize: 44,
    lineHeight: 48,
    marginBottom: 10,
  },
  importLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    textAlign: "center",
  },
  emptyCard: {
    marginTop: 12,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    marginBottom: 8,
  },
  emptyCopy: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 18,
    lineHeight: 28,
  },
});
