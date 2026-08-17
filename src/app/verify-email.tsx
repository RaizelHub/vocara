import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthFormError } from "@/components/auth/AuthFormError";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthStatusState } from "@/components/auth/AuthStatusState";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme/colors";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "your email address";
  const { resendVerification } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = useCallback(async () => {
    if (loading || email === "your email address") return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await resendVerification(email);
      setMessage("A new verification email is on its way.");
    } catch (resendError) {
      setError(getAuthErrorMessage(resendError, "resendVerification"));
    } finally {
      setLoading(false);
    }
  }, [email, loading, resendVerification]);

  return (
    <AuthScreen>
      <AuthHeader
        onBack={() => router.replace("/signup")}
        title="One last step"
        subtitle="Verify your email to continue to VOCARA."
      />
      <View style={styles.content}>
        <AuthStatusState
          tone="mail"
          title="Check your email"
          body="We sent a verification link to:"
          emphasizedText={email}
        />
        <Text style={styles.guidance}>
          Open the email and verify your account to continue. You can return to VOCARA from the verification link.
        </Text>
        <AuthFormError message={error} />
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.success}>
            {message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <AuthButton
            label="Back to Sign In"
            onPress={() => router.replace("/login")}
          />
          <View style={styles.resendRow}>
            <Text style={styles.resendLead}>Didn&apos;t receive it?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resend verification email"
              disabled={loading || email === "your email address"}
              onPress={handleResend}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.resendLink}>{loading ? "Sending..." : "Resend email"}</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace("/signup")}
            style={({ pressed }) => [styles.wrongEmail, pressed && styles.pressed]}
          >
            <Text style={styles.wrongEmailText}>Wrong email? Go back</Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    marginTop: 28,
  },
  guidance: {
    marginTop: 16,
    color: colors.secondary,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: "center",
  },
  success: {
    marginTop: 14,
    color: colors.success,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "center",
  },
  actions: {
    marginTop: 30,
  },
  resendRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
  },
  resendLead: {
    color: colors.secondary,
    fontSize: 14.5,
  },
  resendLink: {
    color: colors.accent,
    fontSize: 14.5,
    fontWeight: "700",
  },
  wrongEmail: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  wrongEmailText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.6,
  },
});
