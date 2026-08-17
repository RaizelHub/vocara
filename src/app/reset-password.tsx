import { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthFormError } from "@/components/auth/AuthFormError";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthStatusState } from "@/components/auth/AuthStatusState";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";

export default function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);

  const passwordError = submitted && password.length < 8 ? "Use at least 8 characters" : undefined;
  const confirmError = submitted && password !== confirmPassword ? "Passwords do not match" : undefined;
  const valid = password.length >= 8 && password === confirmPassword;

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setSuccess(true);
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError, "updatePassword"));
    } finally {
      setLoading(false);
    }
  }, [loading, password, updatePassword, valid]);

  const continueToSignIn = useCallback(async () => {
    await signOut().catch(() => undefined);
    router.replace("/login");
  }, [signOut]);

  return (
    <AuthScreen>
      <AuthHeader
        title={success ? "Password updated" : "Create a new password"}
        subtitle={
          success
            ? "Your account is secure and ready."
            : "Choose a strong password for your account."
        }
      />
      {success ? (
        <View style={styles.success}>
          <AuthStatusState
            tone="success"
            title="Password updated"
            body="You can now sign in with your new password."
          />
          <View style={styles.action}>
            <AuthButton label="Continue to Sign In" onPress={continueToSignIn} />
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <View>
            <AuthInput
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a new password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              editable={!loading}
              error={passwordError}
            />
            <PasswordStrength password={password} />
          </View>
          <AuthInput
            label="Confirm password"
            inputRef={confirmRef}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat your new password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={handleSubmit}
            editable={!loading}
            error={confirmError}
          />
          <AuthFormError message={error} />
          <View style={styles.action}>
            <AuthButton
              label="Update Password"
              loadingLabel="Updating password..."
              onPress={handleSubmit}
              loading={loading}
            />
          </View>
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: 32,
    gap: 18,
  },
  success: {
    marginTop: 40,
  },
  action: {
    marginTop: 12,
  },
});
