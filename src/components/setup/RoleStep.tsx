import { StyleSheet, Text, TextInput, View } from "react-native";

import { ChoiceChip } from "./ChoiceChip";
import { colors } from "@/theme/colors";

export type RoleStepProps = {
  role: string;
  customRole: string;
  onChangeRole: (role: string) => void;
  onChangeCustomRole: (customRole: string) => void;
};

const ROLES = [
  { label: "Software Developer", mark: "SD", tint: "#E9EDF3" },
  { label: "Virtual Assistant", mark: "VA", tint: "#F1E9E3" },
  { label: "Customer Support", mark: "CS", tint: "#E8F0E9" },
  { label: "IT Support", mark: "IT", tint: "#ECE9F2" },
  { label: "Sales", mark: "SL", tint: "#F5EFE2" },
  { label: "Teacher", mark: "TC", tint: "#E7F0F2" },
  { label: "Marketing", mark: "MK", tint: "#F2EAEC" },
  { label: "Other", mark: "…", tint: "#EFEFEA" },
] as const;

/**
 * Step 1: the target role, as scannable tiles. Picking "Other" reveals a
 * quiet text field for the user's own role name.
 */
export function RoleStep({
  role,
  customRole,
  onChangeRole,
  onChangeCustomRole,
}: RoleStepProps) {
  const isOther = role === "Other";

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {ROLES.map((option) => (
          <ChoiceChip
            key={option.label}
            label={option.label}
            mark={option.mark}
            tint={option.tint}
            selected={role === option.label}
            onPress={() => onChangeRole(option.label)}
          />
        ))}
      </View>

      {isOther && (
        <View style={styles.customField}>
          <Text style={styles.customLabel}>Your target role</Text>
          <TextInput
            style={styles.customInput}
            value={customRole}
            onChangeText={onChangeCustomRole}
            placeholder="e.g. Data Analyst"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            selectionColor={colors.accent}
            accessibilityLabel="Your target role"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 34,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  customField: {
    marginTop: 22,
  },
  customLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: colors.secondary,
    marginBottom: 7,
  },
  customInput: {
    height: 56,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    fontSize: 16,
    color: colors.ink,
  },
});