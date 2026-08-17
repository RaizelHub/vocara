import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthFormError } from "@/components/auth/AuthFormError";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme/colors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const emailInvalid = submitted && !EMAIL_RE.test(email.trim());
  const passwordMissing = submitted && password.length === 0;

  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    if (!valid || loading) return;
    setLoading(true);
    setFormError(null);
    try {
      await signIn(email, password);
    } catch (error) {
      setFormError(getAuthErrorMessage(error, "signIn"));
    } finally {
      setLoading(false);
    }
  }, [email, loading, password, signIn, valid]);

  return (
    <AuthScreen>
      <AuthHeader
        title="Welcome back"
        subtitle="Continue building your confidence."
      />

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
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
          error={emailInvalid ? "Enter a valid email address" : undefined}
        />
        <View>
          <AuthInput
            label="Password"
            inputRef={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            submitBehavior="blurAndSubmit"
            editable={!loading}
            error={passwordMissing ? "Enter your password" : undefined}
          />
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push("/forgot-password")}
            style={({ pressed }) => [
              styles.forgotHit,
              pressed && styles.linkPressed,
            ]}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </View>
      </View>

      <AuthFormError message={formError} />

      <View style={styles.footer}>
        <AuthButton
          label="Sign In"
          loadingLabel="Signing in..."
          onPress={handleSubmit}
          loading={loading}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLead}>Don&apos;t have an account?</Text>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.replace("/signup")}
            style={({ pressed }) => pressed && styles.linkPressed}
          >
            <Text style={styles.switchLink}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: 34,
    gap: 18,
  },
  forgotHit: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  forgot: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
  },
  linkPressed: {
    opacity: 0.6,
  },
  footer: {
    marginTop: 28,
    alignItems: "stretch",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    marginTop: 20,
    paddingVertical: 4,
  },
  switchLead: {
    fontSize: 14.5,
    color: colors.secondary,
  },
  switchLink: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.accent,
  },
});
