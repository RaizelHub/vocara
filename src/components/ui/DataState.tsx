import { StyleSheet, Text, View } from "react-native";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";

export type LoadingStateProps = {
  label: string;
};

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <View style={styles.wrap}>
      <LiveWaveform
        active
        barCount={20}
        height={38}
        intensity={0.55}
        barWidth={3}
        gap={2}
        idleColor={colors.border}
      />
      <Text style={styles.title} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </View>
  );
}

export type ErrorStateProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

/**
 * Centered failure block with the app's single strong action, used by data-driven
 * screens (Home, Progress, results) so retry/auth errors never end in a spinner.
 */
export function ErrorState({ title, message, onRetry, retryLabel = "Try again" }: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message} accessibilityRole="alert">
        {message}
      </Text>
      <View style={styles.retry}>
        <PrimaryButton label={retryLabel} onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 44,
  },
  title: {
    marginTop: 26,
    fontSize: 19,
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
    marginTop: 24,
  },
});