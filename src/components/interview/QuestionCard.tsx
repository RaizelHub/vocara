import { StyleSheet, Text, View } from "react-native";

export type QuestionCardProps = {
  question: string;
};

/**
 * The interview question — the main focus of the room. Large, readable,
 * centered, with a restful hint underneath.
 */
export function QuestionCard({ question }: QuestionCardProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.question} accessibilityRole="header">
        {question}
      </Text>
      <Text style={styles.hint}>Take a moment to think before you answer.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  question: {
    fontSize: 30,
    lineHeight: 41,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#F6F5F0",
    textAlign: "center",
  },
  hint: {
    marginTop: 18,
    fontSize: 13.5,
    color: "#8C8A82",
    textAlign: "center",
  },
});