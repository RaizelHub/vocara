import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export type PasswordStrengthProps = {
  password: string;
};

type Strength = { score: 0 | 1 | 2 | 3; label: string; color: string };

const LEVELS: Record<number, Strength> = {
  0: { score: 0, label: "Too short", color: colors.border },
  1: { score: 1, label: "Weak", color: colors.accentDark },
  2: { score: 2, label: "Fair", color: colors.accent },
  3: { score: 3, label: "Strong", color: colors.success },
};

/**
 * A playful-but-honest signal on password length and mix. Three small
 * segments fill in as the password improves; no security claims made.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const length = password.length;
  if (length === 0) return null;

  let level: Strength;
  if (length < 8) {
    level = LEVELS[0];
  } else if (length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    level = LEVELS[1];
  } else if (length < 13 && !/[^A-Za-z0-9]/.test(password)) {
    level = LEVELS[2];
  } else {
    level = LEVELS[3];
  }

  const minMet = length >= 8;

  return (
    <View style={styles.wrap}>
      <View style={styles.segments}>
        {[1, 2, 3].map((segment) => (
          <View
            key={segment}
            style={[
              styles.segment,
              segment <= level.score && {
                backgroundColor: level.color,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: level.color }]}>
          {length === 0 ? "" : level.label}
        </Text>
        <View style={styles.requirement}>
          <View
            style={[
              styles.check,
              { backgroundColor: minMet ? colors.success : colors.border },
            ]}
          >
            {minMet && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text
            style={[
              styles.requirementText,
              minMet && styles.requirementTextMet,
            ]}
          >
            8+ characters
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    gap: 8,
  },
  segments: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  requirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  check: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  requirementText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.muted,
  },
  requirementTextMet: {
    color: colors.success,
  },
});