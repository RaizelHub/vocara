import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";

export type AuthBootstrapProps = {
  error?: string | null;
  onRetry?: () => void;
};

export function AuthBootstrap({ error, onRetry }: AuthBootstrapProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.wordmark}>VOCARA</Text>
      <View style={styles.center}>
        <LiveWaveform
          active={!error}
          barCount={20}
          height={38}
          barWidth={3}
          gap={2}
          idleColor={colors.border}
        />
        <Text style={styles.title}>{error ? "VOCARA needs your attention" : "Loading your practice space"}</Text>
        <Text style={styles.message} accessibilityRole={error ? "alert" : undefined}>
          {error ?? "Restoring your account and preferences."}
        </Text>
      </View>
      {error && onRetry ? (
        <View style={styles.retry}>
          <PrimaryButton label="Try again" onPress={onRetry} />
        </View>
      ) : (
        <View style={styles.retryPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.ink,
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 30,
  },
  title: {
    marginTop: 26,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: "center",
  },
  message: {
    maxWidth: 330,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
    textAlign: "center",
  },
  retry: {
    alignSelf: "stretch",
  },
  retryPlaceholder: {
    height: 56,
  },
});
