import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthFormError } from "@/components/auth/AuthFormError";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme/colors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const namePending = (touched.name || submitted) && name.trim().length === 0;
  const emailInvalid =
    (touched.email || submitted) && !EMAIL_RE.test(email.trim());
  const passwordShort =
    (touched.password || submitted) && password.length < 8;
  const passwordsMismatch =
    (touched.confirmPassword || submitted) && confirmPassword !== password;

  const valid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    password.length >= 8 &&
    confirmPassword === password;

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    if (!valid || loading) return;

    setLoading(true);
    setFormError(null);
    try {
      const result = await signUp({
        fullName: name,
        email,
        password,
      });
      if (result.requiresEmailConfirmation) {
        router.replace({ pathname: "/verify-email", params: { email: result.email } });
      }
    } catch (error) {
      setFormError(getAuthErrorMessage(error, "signUp"));
    } finally {
      setLoading(false);
    }
  }, [email, loading, name, password, signUp, valid]);

  return (
    <AuthScreen>
      <AuthHeader
        title="Create your account"
        subtitle="Start practicing with personalized interview and speaking feedback."
      />

      <View style={styles.form}>
        <AuthInput
          label="Full name"
          value={name}
          onChangeText={setName}
          placeholder="Alex Rivera"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          editable={!loading}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={
            namePending ? "Please enter your full name" : undefined
          }
        />
        <AuthInput
          label="Email"
          inputRef={emailRef}
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
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailInvalid ? "Enter a valid email address" : undefined}
        />
        <View>
          <AuthInput
            label="Password"
            inputRef={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            editable={!loading}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            error={passwordShort ? "Use at least 8 characters" : undefined}
          />
          <PasswordStrength password={password} />
        </View>
        <AuthInput
          label="Confirm password"
          inputRef={confirmPasswordRef}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repeat your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={handleSubmit}
          editable={!loading}
          onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
          error={passwordsMismatch ? "Passwords do not match" : undefined}
        />
      </View>

      <AuthFormError message={formError} />

      <View style={styles.footer}>
        <AuthButton
          label="Create Account"
          loadingLabel="Creating account..."
          onPress={handleSubmit}
          loading={loading}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLead}>Already have an account?</Text>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push("/login")}
            style={({ pressed }) => pressed && styles.linkPressed}
          >
            <Text style={styles.switchLink}>Sign in</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.terms}>
        By creating an account, you agree to our{" "}
        <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
        <Text style={styles.termsLink}>Privacy Policy</Text>.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: 32,
    gap: 18,
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
    textDecorationLine: "none",
  },
  linkPressed: {
    opacity: 0.6,
  },
  terms: {
    marginTop: 26,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    color: colors.muted,
  },
  termsLink: {
    color: colors.secondary,
    textDecorationLine: "underline",
  },
});
