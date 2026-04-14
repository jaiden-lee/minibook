import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useMemo, useRef } from "react";
import Pdf from "react-native-pdf";
import type { PdfProps } from "react-native-pdf";
import type { AppearanceTheme } from "../theme";
import { mobileThemes } from "../theme";

type NativePdfViewProps = {
  fileUri: string;
  theme: AppearanceTheme;
  page: number;
  onLoaded: (numberOfPages: number) => void;
  onPageChanged: (page: number, numberOfPages: number) => void;
  onError: (message: string) => void;
};

export function NativePdfView({
  fileUri,
  theme,
  page,
  onLoaded,
  onPageChanged,
  onError,
}: NativePdfViewProps) {
  const palette = mobileThemes[theme];
  const pdfRef = useRef<Pdf>(null);
  const source = useMemo<PdfProps["source"]>(() => ({
    uri: fileUri,
    cache: false,
  }), [fileUri]);

  return (
    <View style={[styles.wrap, { backgroundColor: palette.surfaceLowest, shadowColor: palette.shadow }]}>
      <Pdf
        ref={pdfRef}
        source={source}
        page={page}
        fitPolicy={0}
        minScale={1}
        maxScale={4}
        horizontal={false}
        enablePaging={false}
        enableAnnotationRendering
        showsVerticalScrollIndicator={false}
        trustAllCerts={false}
        style={styles.pdf}
        renderActivityIndicator={(progress) => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={[styles.loadingText, { color: palette.onSurfaceVariant }]}>
              Loading PDF {Math.round(progress * 100)}%
            </Text>
          </View>
        )}
        onLoadComplete={(numberOfPages) => onLoaded(numberOfPages)}
        onPageChanged={onPageChanged}
        onPressLink={(url) => {
          void Linking.openURL(url).catch(() => {
            onError(`Unable to open link: ${url}`);
          });
        }}
        onError={(error) => {
          const message = error instanceof Error ? error.message : String(error);
          onError(message);
        }}
      />
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
  pdf: {
    flex: 1,
    width: "100%",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
