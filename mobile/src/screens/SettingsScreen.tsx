import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomBar } from "../components/BottomBar";
import { mobileThemes, type AppearanceTheme } from "../theme";

type SettingsScreenProps = {
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onBackToLibrary: () => void;
};

export function SettingsScreen({ theme, onThemeChange, onBackToLibrary }: SettingsScreenProps) {
  const palette = mobileThemes[theme];

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
          <Text style={[styles.sectionTitle, { color: palette.onSurfaceVariant }]}>Roadmap for this mobile pass</Text>
          {[
            "Import PDFs into app-local storage",
            "Render local PDFs with a native viewer surface",
            "Save and restore local reading progress",
            "Match the web app's editorial feel on mobile",
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
