import { StyleSheet, Text, View } from "react-native";

import { LiveWaveform } from "@/components/interview/LiveWaveform";

export function ProcessingAnswer({
  stage,
}: {
  stage: "uploading" | "transcribing" | "evaluating" | "finalizing" | "ready";
}) {
  const processing = stage !== "ready";
  const label =
    stage === "uploading"
      ? "Saving your answer…"
      : stage === "transcribing"
        ? "Creating transcript…"
        : stage === "evaluating"
          ? "Creating your feedback…"
          : stage === "finalizing"
            ? "Building your summary…"
            : "Answer ready";
  const hint =
    stage === "evaluating"
      ? "Keep Vocara open while your feedback is prepared."
      : stage === "finalizing"
        ? "Keep Vocara open while your summary is prepared."
        : "Keep Vocara open while your answer is processed.";

  return (
    <View style={styles.wrap}>
      <LiveWaveform
        active={processing}
        barCount={24}
        height={40}
        intensity={0.55}
        barWidth={3}
      />
      <Text style={styles.label} accessibilityLiveRegion="polite">
        {label}
      </Text>
      {processing && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 16,
  },
  label: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#E7E6E0",
  },
  hint: {
    color: "#8C8A82",
    fontSize: 12.5,
    textAlign: "center",
  },
});
