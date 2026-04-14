import { StyleSheet, Text, View } from "react-native";
import type { AppearanceTheme } from "../theme";
import { mobileThemes } from "../theme";

type NativePdfViewProps = {
  fileUri: string;
  theme: AppearanceTheme;
};

export function NativePdfView({ fileUri, theme }: NativePdfViewProps) {
  const palette = mobileThemes[theme];

  return (
    <View style={[styles.wrap, { backgroundColor: palette.surfaceLowest, shadowColor: palette.shadow }]}>
      <View style={styles.placeholder}>
        <Text style={[styles.placeholderTitle, { color: palette.onSurface }]}>Native PDF surface</Text>
        <Text style={[styles.placeholderCopy, { color: palette.onSurfaceVariant }]}>
          Local PDF import and progress persistence are wired. The next mobile pass will replace this placeholder with
          the native `react-native-pdf` surface inside a custom Expo dev client.
        </Text>
        <Text style={[styles.placeholderPath, { color: palette.primary }]} numberOfLines={2}>
          {fileUri}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  placeholderTitle: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 22,
    marginBottom: 12,
    letterSpacing: -0.8,
  },
  placeholderCopy: {
    fontFamily: "Newsreader_400Regular",
    fontSize: 18,
    lineHeight: 28,
  },
  placeholderPath: {
    marginTop: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
