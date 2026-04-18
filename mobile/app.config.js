const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || "com.googleusercontent.apps.placeholder";

export default {
  expo: {
    name: "minibook",
    slug: "minibook",
    scheme: "minibook",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    plugins: [
      "expo-document-picker",
      "expo-sqlite",
      "expo-dev-client",
      "@config-plugins/react-native-blob-util",
      "@config-plugins/react-native-pdf",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme,
        },
      ],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.jaide.minibook",
    },
    android: {
      package: "com.jaide.minibook",
    },
  },
};
