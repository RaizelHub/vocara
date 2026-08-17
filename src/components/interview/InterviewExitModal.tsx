import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export type InterviewExitModalProps = {
  visible: boolean;
  onClose: () => void;
  onLeave: () => void;
};

/**
 * Custom confirmation for leaving the interview mid-way. Soft entrance,
 * nothing on the backdrop mis-taps, no system Alert.
 */
export function InterviewExitModal({ visible, onClose, onLeave }: InterviewExitModalProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          onPress={onClose}
        />
        <Animated.View entering={FadeInDown.duration(260)} style={styles.card}>
          <Text style={styles.title}>Leave interview?</Text>
          <Text style={styles.description}>
            {"Your current practice session won't be completed."}
          </Text>
          <PressableScale onPress={onClose} accessibilityLabel="Keep practicing" style={styles.keepWrap}>
            <Text style={styles.keep}>Keep practicing</Text>
          </PressableScale>
          <PressableScale onPress={onLeave} accessibilityLabel="Leave interview" style={styles.leaveWrap}>
            <Text style={styles.leave}>Leave interview</Text>
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
    marginBottom: 24,
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
  leaveWrap: {
    alignSelf: "stretch",
  },
  leave: {
    textAlign: "center",
    height: 54,
    lineHeight: 54,
    includeFontPadding: false,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#3A3832",
    color: "#B9B8B0",
    fontSize: 15.5,
    fontWeight: "800",
  },
});