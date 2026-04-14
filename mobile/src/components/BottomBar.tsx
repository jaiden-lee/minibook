import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileThemes, type AppearanceTheme } from "../theme";

type Tab = "library" | "settings";

type BottomBarProps = {
  activeTab: Tab;
  theme: AppearanceTheme;
  onSelect: (tab: Tab) => void;
};

export function BottomBar({ activeTab, theme, onSelect }: BottomBarProps) {
  const palette = mobileThemes[theme];

  return (
    <View style={[styles.wrap, { backgroundColor: `${palette.surface}EE`, shadowColor: palette.shadow }]}>
      <BarItem label="Library" active={activeTab === "library"} theme={theme} onPress={() => onSelect("library")} />
      <BarItem label="Settings" active={activeTab === "settings"} theme={theme} onPress={() => onSelect("settings")} />
    </View>
  );
}

function BarItem({
  active,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  label: string;
  theme: AppearanceTheme;
  onPress: () => void;
}) {
  const palette = mobileThemes[theme];

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.item,
        active
          ? { backgroundColor: palette.surfaceHighest }
          : null,
      ]}
    >
      <Text style={[styles.itemLabel, { color: active ? palette.onSurface : palette.onSurfaceVariant }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 10,
  },
  item: {
    minWidth: 116,
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  itemLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
