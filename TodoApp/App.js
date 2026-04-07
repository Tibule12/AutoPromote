import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const DEFAULT_STUDIO_URL = "https://www.autopromote.org";

export default function App() {
  const [showStudio, setShowStudio] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const studioUrl = useMemo(() => {
    const configured = Constants.expoConfig?.extra?.studioUrl;
    return typeof configured === "string" && configured.trim()
      ? configured.trim()
      : DEFAULT_STUDIO_URL;
  }, []);

  const openInBrowser = async () => {
    await Linking.openURL(studioUrl);
  };

  if (showStudio) {
    return (
      <SafeAreaView style={styles.viewerRoot}>
        <StatusBar style="light" />
        <View style={styles.viewerHeader}>
          <Pressable style={styles.secondaryButton} onPress={() => setShowStudio(false)}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.viewerTitle}>Viral Clip Studio</Text>
          <Pressable style={styles.secondaryButton} onPress={openInBrowser}>
            <Text style={styles.secondaryButtonText}>Safari</Text>
          </Pressable>
        </View>

        <View style={styles.viewerBody}>
          {loadError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Studio failed to load in-app</Text>
              <Text style={styles.errorCopy}>{loadError}</Text>
              <Pressable style={styles.primaryButton} onPress={openInBrowser}>
                <Text style={styles.primaryButtonText}>Open Studio in Safari</Text>
              </Pressable>
            </View>
          ) : null}

          <WebView
            source={{ uri: studioUrl }}
            style={styles.webview}
            originWhitelist={["*"]}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loaderOverlay}>
                <ActivityIndicator size="large" color="#ff8a3d" />
                <Text style={styles.loaderText}>Loading Viral Clip Studio…</Text>
              </View>
            )}
            onLoadStart={() => {
              setIsLoading(true);
              setLoadError("");
            }}
            onLoadEnd={() => setIsLoading(false)}
            onError={event => {
              setIsLoading(false);
              setLoadError(event.nativeEvent.description || "Unknown WebView error.");
            }}
          />

          {isLoading && !loadError ? (
            <View pointerEvents="none" style={styles.inlineLoadHint}>
              <Text style={styles.inlineLoadHintText}>Opening studio workspace…</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>iOS Studio Access</Text>
        <Text style={styles.title}>Viral Clip Studio</Text>
        <Text style={styles.copy}>
          Open the hosted studio directly inside the iOS app instead of landing on a placeholder screen.
        </Text>

        <Pressable style={styles.primaryButton} onPress={() => setShowStudio(true)}>
          <Text style={styles.primaryButtonText}>Open Viral Clip Studio</Text>
        </Pressable>

        <Pressable style={styles.secondaryCta} onPress={openInBrowser}>
          <Text style={styles.secondaryCtaText}>Open in Safari instead</Text>
        </Pressable>

        <Text style={styles.hint}>Studio URL: {studioUrl}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0e14",
    justifyContent: "center",
    padding: 20,
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#151a24",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  eyebrow: {
    color: "#ffb47a",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    color: "#fff6eb",
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 12,
  },
  copy: {
    color: "#c8d0dd",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: "#ff8a3d",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#1a0d05",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryCta: {
    marginTop: 14,
    alignItems: "center",
  },
  secondaryCtaText: {
    color: "#ffd6b2",
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    marginTop: 18,
    color: "#93a0b5",
    fontSize: 12,
    lineHeight: 18,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: "#0b0e14",
  },
  viewerHeader: {
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111722",
  },
  viewerTitle: {
    color: "#fff6eb",
    fontSize: 17,
    fontWeight: "800",
  },
  secondaryButton: {
    minWidth: 64,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#f4f7fb",
    fontSize: 14,
    fontWeight: "700",
  },
  viewerBody: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "#0b0e14",
  },
  loaderOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b0e14",
    gap: 12,
  },
  loaderText: {
    color: "#e5ebf5",
    fontSize: 15,
  },
  inlineLoadHint: {
    position: "absolute",
    right: 14,
    bottom: 14,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(9, 12, 18, 0.72)",
  },
  inlineLoadHintText: {
    color: "#f3f6fb",
    fontSize: 12,
    fontWeight: "700",
  },
  errorCard: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 2,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(51, 22, 16, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 164, 132, 0.2)",
  },
  errorTitle: {
    color: "#fff2ea",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  errorCopy: {
    color: "#ffd8c4",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
});
