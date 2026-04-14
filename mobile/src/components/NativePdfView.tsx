import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
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

type ViewerEvent =
  | { type: "viewer-ready" }
  | { type: "loaded"; totalPages: number }
  | { type: "page-changed"; page: number; totalPages: number }
  | { type: "single-tap" }
  | { type: "link-pressed"; url: string }
  | { type: "error"; message: string };

const ANDROID_VIEWER_URI = "file:///android_asset/minibook-pdf/viewer.html";

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
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queuedCommandsRef = useRef<string[]>([]);
  const source = useMemo(() => {
    if (Platform.OS === "android") {
      return { uri: ANDROID_VIEWER_URI };
    }

    return null;
  }, []);

  const postCommand = useCallback((command: unknown) => {
    const payload = JSON.stringify(command)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");
    const script = `window.minibookReceive(JSON.parse(\`${payload}\`)); true;`;

    if (!readyRef.current) {
      queuedCommandsRef.current.push(script);
      return;
    }

    webViewRef.current?.injectJavaScript(script);
  }, []);

  useEffect(() => {
    readyRef.current = false;
    queuedCommandsRef.current = [];
  }, [fileUri]);

  useEffect(() => {
    postCommand({
      type: "open-pdf",
      fileUri,
      initialPage,
      theme,
    });
  }, [fileUri, initialPage, theme, postCommand]);

  useEffect(() => {
    postCommand({
      type: "set-theme",
      theme,
    });
  }, [theme, postCommand]);

  useEffect(() => {
    if (!jumpRequest) {
      return;
    }

    postCommand({
      type: "jump-to-page",
      page: jumpRequest.page,
    });
  }, [jumpRequest?.id, postCommand]);

  function flushQueuedCommands() {
    readyRef.current = true;
    for (const script of queuedCommandsRef.current) {
      webViewRef.current?.injectJavaScript(script);
    }
    queuedCommandsRef.current = [];
  }

  function handleMessage(event: WebViewMessageEvent) {
    let payload: ViewerEvent;

    try {
      payload = JSON.parse(event.nativeEvent.data) as ViewerEvent;
    } catch {
      return;
    }

    switch (payload.type) {
      case "viewer-ready":
        flushQueuedCommands();
        return;
      case "loaded":
        onLoaded(payload.totalPages);
        return;
      case "page-changed":
        onPageChanged(payload.page, payload.totalPages);
        return;
      case "single-tap":
        onSingleTap();
        return;
      case "link-pressed":
        void Linking.openURL(payload.url).catch(() => {
          onError(`Unable to open link: ${payload.url}`);
        });
        return;
      case "error":
        console.log("[minibook mobile viewer]", payload.message);
        onError(payload.message);
        return;
      default:
        return;
    }
  }

  if (!source) {
    return (
      <View style={[styles.wrap, { backgroundColor: palette.surfaceLowest, shadowColor: palette.shadow }]}>
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: palette.onSurfaceVariant }]}>
            Mobile PDF.js viewer is currently configured for Android first.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: palette.surfaceLowest }]}>
      <WebView
        ref={webViewRef}
        source={source}
        originWhitelist={["*"]}
        allowFileAccess
        allowingReadAccessToURL="file:///"
        allowUniversalAccessFromFileURLs
        allowFileAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={[styles.loadingText, { color: palette.onSurfaceVariant }]}>Loading PDF viewer</Text>
          </View>
        )}
        onMessage={handleMessage}
        onError={(event) => {
          onError(event.nativeEvent.description ?? "Unable to open the embedded PDF viewer.");
        }}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
});
