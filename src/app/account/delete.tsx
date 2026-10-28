import { useRef, useState } from "react";
import { Button, ScrollView, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { requestAccountDeletion } from "@/services/accountDeletionService";
import { colors } from "@/theme/colors";
export default function DeleteAccount() {
  const { user, deletionPending, refreshProfile, signOut } = useAuth();
  const [email, setEmail] = useState(user?.email ?? ""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const insets = useSafeAreaInsets();
  const pending = submitted || deletionPending;
  async function submit() {
    if (lock.current || confirmation !== "DELETE" || !password) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await requestAccountDeletion(user?.email ?? email, password);
      setPassword("");
      setSubmitted(true);
      if (user) await refreshProfile();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Request unavailable. Please retry.",
      );
    } finally {
      setPassword("");
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        paddingTop: insets.top + 24,
        gap: 18,
        backgroundColor: colors.background,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 26, fontWeight: "700" }}
      >
        Delete your Vocara account
      </Text>
      <Text>
        Request permanent removal of your account, profile, interview questions
        and answers, transcripts, feedback, resumes, recordings, practice
        history, usage records and local subscription mapping.
      </Text>
      <Text>
        Practice access stops when your request is accepted. Deletion runs in
        stages after verification and processor review. Interrupted cleanup is
        retried. There is no automatic cancellation after confirmation.
      </Text>
      <Text>
        Existing backups and data held by Groq, RevenueCat or monitoring
        providers follow their applicable retention and erasure processes. This
        does not promise instant removal from every backup or cancel a store
        subscription. Vocara purchases remain in test mode.
      </Text>
      <Link href="/privacy">Read the privacy notice and retention details</Link>
      {pending
        ? (
          <View style={{ gap: 14 }}>
            <Text accessibilityRole="alert">
              Deletion requested. Your account is blocked from practice while
              processor review and cleanup are pending. You may sign out; the
              server job will continue. This message does not mean deletion has
              finished.
            </Text>
            <Button
              title="Sign out"
              onPress={() => {
                void signOut().catch(() =>
                  setError("Sign-out failed. Please retry.")
                );
              }}
            />
          </View>
        )
        : (
          <>
            <Text>
              Confirm your identity with your current password, then type
              DELETE. If you forgot your password, use the password reset option
              on the login screen first.
            </Text>
            {!user?.email && (
              <TextInput
                accessibilityLabel="Account email"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ padding: 14, borderWidth: 1, borderRadius: 8 }}
              />
            )}
            <TextInput
              accessibilityLabel="Current password"
              placeholder="Current password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              style={{ padding: 14, borderWidth: 1, borderRadius: 8 }}
            />
            <TextInput
              accessibilityLabel="Type DELETE to confirm"
              placeholder="Type DELETE"
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              style={{ padding: 14, borderWidth: 1, borderRadius: 8 }}
            />
            <Button
              title={busy
                ? "Verifying and requesting�"
                : "Permanently delete my account"}
              color={colors.error}
              disabled={busy || confirmation !== "DELETE" || !password ||
                !(user?.email ?? email)}
              onPress={() => {
                void submit();
              }}
            />
          </>
        )}
      {error
        ? (
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {error}
          </Text>
        )
        : null}
    </ScrollView>
  );
}
