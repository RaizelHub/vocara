import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export type InterviewAbandonModalProps = {
  visible: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  abandoning?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Confirmation modal for safely abandoning an unrecoverable or incomplete interview session.
 * Preserves dark interview room aesthetics without system Alert dependencies.
 */
export function InterviewAbandonModal({
  visible,
  title = "End this interview?",
  description = "Your completed answers and feedback will remain saved in your practice history. This incomplete interview will be ended and cannot be resumed.",
  confirmLabel = "End interview",
  cancelLabel = "Keep session",
  abandoning = false,
  error = null,
  onClose,
  onConfirm,
}: InterviewAbandonModalProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={abandoning ? undefined : onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          onPress={abandoning ? undefined : onClose}
        />
        <Animated.View entering={FadeInDown.duration(260)} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PressableScale
            onPress={onClose}
            accessibilityLabel={cancelLabel}
            disabled={abandoning}
            style={styles.keepWrap}
          >
            <Text style={[styles.keep, abandoning && styles.disabled]}>{cancelLabel}</Text>
          </PressableScale>

          <PressableScale
            onPress={onConfirm}
            accessibilityLabel={confirmLabel}
            disabled={abandoning}
            style={styles.abandonWrap}
          >
            {abandoning ? (
              <View style={styles.abandonLoading}>
                <ActivityIndicator size="small" color="#E05D52" />
                <Text style={styles.abandonLoadingText}>Ending interview…</Text>
              </View>
            ) : (
              <Text style={styles.abandon}>{confirmLabel}</Text>
            )}
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 7, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    backgroundColor: "#1F1E1A",
    borderWidth: 1,
    borderColor: "#2E2C27",
    padding: 26,
    alignItems: "center",
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#F6F5F0",
  },
  description: {
    fontSize: 14.5,
    lineHeight: 21,
    color: "#9C9B93",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: "#F87171",
    textAlign: "center",
    marginBottom: 16,
  },
  keepWrap: {
    alignSelf: "stretch",
    marginBottom: 10,
  },
  keep: {
    textAlign: "center",
    height: 54,
    lineHeight: 54,
    includeFontPadding: false,
    borderRadius: 27,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  abandonWrap: {
    alignSelf: "stretch",
  },
  abandon: {
    textAlign: "center",
    height: 54,
    lineHeight: 54,
    includeFontPadding: false,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#3A3832",
    color: "#E05D52",
    fontSize: 15.5,
    fontWeight: "800",
  },
  abandonLoading: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#3A3832",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  abandonLoadingText: {
    color: "#E05D52",
    fontSize: 15.5,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.6,
  },
});

