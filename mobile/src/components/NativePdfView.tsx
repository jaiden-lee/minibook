import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import Pdf from "react-native-pdf";
import type { PdfProps } from "react-native-pdf";
import type { AppearanceTheme } from "../theme";
import { mobileThemes } from "../theme";

type NativePdfViewProps = {
  fileUri: string;
  theme: AppearanceTheme;
  initialPage: number;
  jumpRequest: { page: number; id: number } | null;
  onLoaded: (numberOfPages: number) => void;
  onPageChanged: (page: number, numberOfPages: number) => void;
  onSingleTap: () => void;
  onError: (message: string) => void;
};

export function NativePdfView({
  fileUri,
  theme,
  initialPage,
  jumpRequest,
  onLoaded,
  onPageChanged,
  onSingleTap,
  onError,
}: NativePdfViewProps) {
  const palette = mobileThemes[theme];
  const pdfRef = useRef<Pdf>(null);
  const loadedRef = useRef(false);
  const pendingJumpRef = useRef<number | null>(initialPage);
  const source = useMemo<PdfProps["source"]>(() => ({
    uri: fileUri,
    cache: false,
  }), [fileUri]);

  useEffect(() => {
    loadedRef.current = false;
    pendingJumpRef.current = initialPage;
  }, [fileUri, initialPage]);

  useEffect(() => {
    if (!jumpRequest) {
      return;
    }

    if (loadedRef.current) {
      pdfRef.current?.setPage(jumpRequest.page);
      return;
    }

    pendingJumpRef.current = jumpRequest.page;
  }, [jumpRequest?.id]);

  return (
    <View style={[styles.wrap, { backgroundColor: palette.surfaceLowest, shadowColor: palette.shadow }]}>
      <Pdf
        ref={pdfRef}
        source={source}
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
        onLoadComplete={(numberOfPages) => {
          loadedRef.current = true;
          if (pendingJumpRef.current !== null) {
            pdfRef.current?.setPage(pendingJumpRef.current);
            pendingJumpRef.current = null;
          }
          onLoaded(numberOfPages);
        }}
        onPageChanged={onPageChanged}
        onPageSingleTap={() => onSingleTap()}
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
