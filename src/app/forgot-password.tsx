import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { AuthFormError } from "@/components/auth/AuthFormError";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthStatusState } from "@/components/auth/AuthStatusState";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme/colors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailInvalid = submitted && !EMAIL_RE.test(email.trim());
  const valid = EMAIL_RE.test(email.trim());

  const handleSend = useCallback(async () => {
    setSubmitted(true);
    if (!valid || loading) return;
    setLoading(true);
    setFormError(null);
    try {
      await resetPassword(email);
      setLoading(false);
      setSent(true);
    } catch (error) {
      setFormError(getAuthErrorMessage(error, "resetPassword"));
      setLoading(false);
    }
  }, [email, loading, resetPassword, valid]);

  return (
    <AuthScreen>
      <AuthHeader
        onBack={() => router.replace("/login")}
        title="Forgot your password?"
        subtitle="Enter the email associated with your account and we'll send you a reset link."
      />

      {sent ? (
        <Animated.View
          key="success"
          entering={FadeInDown.duration(380)}
          style={styles.success}
        >
          <AuthStatusState
            tone="mail"
            title="Check your inbox"
            body="If an account exists for that email, a password reset link has been sent."
          />
          <View style={styles.successAction}>
            <AuthButton
              label="Back to Sign In"
              onPress={() => router.replace("/login")}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="form"
          entering={FadeInDown.duration(380)}
          exiting={FadeOutUp.duration(220)}
          style={styles.formBlock}
        >
          <View style={styles.form}>
            <AuthInput
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              blurOnSubmit
              editable={!loading}
              error={
                emailInvalid
                  ? "Enter a valid email address"
                  : undefined
              }
            />
            <AuthFormError message={formError} />
          </View>
          <View style={styles.sendButton}>
            <AuthButton
              label="Send Reset Link"
              loadingLabel="Sending reset link..."
              onPress={handleSend}
              loading={loading}
            />
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace("/login")}
            style={({ pressed }) => [styles.backLink, pressed && styles.linkPressed]}
          >
            <Text style={styles.backLinkText}>Back to Sign In</Text>
          </Pressable>
        </Animated.View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  formBlock: {
    marginTop: 30,
  },
  form: {
    gap: 16,
  },
  sendButton: {
    marginTop: 26,
    alignItems: "stretch",
  },
  backLink: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  backLinkText: {
    color: colors.accent,
    fontSize: 14.5,
    fontWeight: "700",
  },
  linkPressed: {
    opacity: 0.6,
  },
  success: {
    marginTop: 34,
    alignItems: "center",
  },
  successAction: {
    alignSelf: "stretch",
    marginTop: 34,
  },
});
