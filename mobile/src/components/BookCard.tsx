import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileLibraryBook } from "../../App";
import { mobileThemes, type AppearanceTheme } from "../theme";

type BookCardProps = {
  item: MobileLibraryBook;
  theme: AppearanceTheme;
  onPress: () => void;
};

export function BookCard({ item, theme, onPress }: BookCardProps) {
  const palette = mobileThemes[theme];
  const progress = item.progress ? Math.round(item.progress.logical_progress * 100) : 0;

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <View style={[styles.cover, { backgroundColor: palette.surfaceLowest, shadowColor: palette.shadow }]}>
        <View style={[styles.spine, { backgroundColor: `${palette.onSurface}12` }]} />
        <View style={[styles.coverArt, { backgroundColor: palette.surfaceHigh }]}>
          <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]} numberOfLines={1}>
            {item.book.original_filename}
          </Text>
          <Text style={[styles.title, { color: palette.onSurface }]} numberOfLines={4}>
            {item.book.title}
          </Text>
          <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]} numberOfLines={2}>
            {item.book.local_path.replace(/^file:\/\//, "")}
          </Text>
        </View>
      </View>

      <Text style={[styles.metaTitle, { color: palette.onSurface }]} numberOfLines={2}>
        {item.book.title}
      </Text>
      <Text style={[styles.metaCopy, { color: palette.onSurfaceVariant }]}>
        {item.progress ? `Page ${item.progress.page}` : "Unread volume"}
      </Text>

      <View style={[styles.progressRail, { backgroundColor: palette.surfaceHigh }]}>
        <View style={[styles.progressFill, { backgroundColor: palette.tertiaryFixedDim, width: `${progress}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "47%",
    marginBottom: 28,
  },
  cover: {
    aspectRatio: 0.68,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    marginBottom: 12,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    zIndex: 2,
  },
  coverArt: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: "space-between",
  },
  kicker: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Newsreader_500Medium",
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1,
  },
  metaTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  metaCopy: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 14,
    marginTop: 2,
    marginBottom: 8,
  },
  progressRail: {
    height: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
});
