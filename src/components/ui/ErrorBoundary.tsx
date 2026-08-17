import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/ui/PressableScale";
import { captureError } from "@/lib/sentry";
import { colors } from "@/theme/colors";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback onRetry={this.reset} />;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.eyebrow}>SOMETHING WENT WRONG</Text>
      <Text style={styles.title}>VOCARA hit an unexpected error.</Text>
      <Text style={styles.body}>
        Your practice data is safe. Try again, or restart the app if this keeps
        happening.
      </Text>
      <PressableScale
        onPress={onRetry}
        accessibilityLabel="Retry"
        style={styles.retryWrap}
      >
        <Text style={styles.retry}>Try again</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: colors.accent,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 10,
    lineHeight: 30,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.secondary,
    marginTop: 10,
  },
  retryWrap: {
    marginTop: 28,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  retry: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
  },
});
