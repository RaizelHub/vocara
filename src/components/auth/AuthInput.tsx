import { useState, type Ref } from "react";
import type {
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
  TextInputProps,
} from "react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability -- Reanimated shared-value writes in focus handlers */

import { colors } from "@/theme/colors";
import { authStyles } from "@/components/auth/authStyles";

export type AuthInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  submitBehavior?: TextInputProps["submitBehavior"];
  inputRef?: Ref<TextInput>;
  onBlur?: () => void;
  error?: string;
  editable?: boolean;
};

/**
 * A bespoke form field: white pill with a soft border, an animated coral
 * focus state, an internal label, and optional inline error copy.
 */
export function AuthInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  submitBehavior,
  inputRef,
  onBlur,
  error,
  editable = true,
}: AuthInputProps) {
  const [secure, setSecure] = useState(secureTextEntry);
  const focus = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [error ? colors.error : colors.border, colors.accent]
    ),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      [colors.surface, "#FFFDFC"]
    ),
    transform: [{ translateY: -focus.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focus.value,
      [0, 1],
      [error ? colors.error : colors.secondary, colors.accent]
    ),
  }));

  return (
    <View>
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
      <Animated.View style={[styles.inputContainer, containerStyle]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, error != null && styles.inputError]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          submitBehavior={submitBehavior}
          onFocus={() => {
            focus.value = withTiming(1, { duration: 220 });
          }}
          onBlur={() => {
            focus.value = withTiming(0, { duration: 220 });
            onBlur?.();
          }}
          selectionColor={colors.accent}
          accessibilityLabel={label}
          accessibilityHint={error}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secure ? "Show password" : "Hide password"}
            hitSlop={10}
            onPress={() => setSecure((s) => !s)}
            disabled={!editable}
            style={styles.eyeButton}
          >
            <EyeIcon crossed={secure} />
          </Pressable>
        )}
      </Animated.View>
      {error != null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <View style={styles.eyeWrap}>
      <View style={[styles.eye, crossed && styles.eyeCovered]}>
        <View style={styles.eyeDot} />
      </View>
      {crossed && <View style={styles.eyeSlash} />}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 7,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: authStyles.fieldHeight,
    borderRadius: authStyles.radius,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
    height: authStyles.fieldHeight,
  },
  inputError: {
    color: colors.ink,
  },
  error: {
    marginTop: 6,
    fontSize: 12.5,
    fontWeight: "500",
    color: colors.error,
  },
  eyeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -8,
  },
  eyeWrap: {
    width: 24,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  eye: {
    width: 22,
    height: 13,
    borderRadius: 999,
    borderWidth: 1.8,
    borderColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeCovered: {
    opacity: 0.55,
  },
  eyeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  eyeSlash: {
    position: "absolute",
    width: 1.8,
    height: 22,
    borderRadius: 1,
    backgroundColor: colors.secondary,
    transform: [{ rotate: "-48deg" }],
  },
});
