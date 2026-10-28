import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { Button, ScrollView, Text } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export default function Privacy() {
  const insets = useSafeAreaInsets();
  const { user, deletionPending } = useAuth();
  const lock = useRef(false);
  const [status, setStatus] = useState("");
  async function requestCopy() {
    if (lock.current) return;
    lock.current = true;
    try {
      const { error } = await supabase.rpc("request_account_data_copy");
      setStatus(
        error
          ? "Request unavailable. Please try again."
          : "Access request received for operator review. This does not create a public download link.",
      );
    } catch {
      setStatus("Request unavailable. Please try again.");
    } finally {
      lock.current = false;
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        paddingTop: insets.top + 24,
        gap: 16,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 26, fontWeight: "700" }}
      >
        Vocara Privacy Policy � review draft
      </Text>
      <Text>
        Operator: [LEGAL / OPERATOR NAME]. Privacy contact: [PRIVACY CONTACT
        EMAIL]. These details and applicable retention obligations require
        developer and legal review before publication.
      </Text>
      <Text>
        We collect account email and authentication information, profile and
        practice preferences, job descriptions, resumes, interview settings,
        questions, recordings, transcripts, AI feedback, history, subscription
        identifiers and usage metadata to provide interview practice, secure
        accounts and control service usage.
      </Text>
      <Text>
        Supabase handles authentication and stores account records and private
        files. Groq receives recordings for transcription and relevant
        questions, transcripts, job or resume information for analysis. Do not
        include information you do not want processed. Groq documents possible
        reliability and abuse-monitoring retention of up to 30 days;
        organization settings and legal exceptions can affect processing. We
        have not verified this project&apos;s zero-retention settings.
      </Text>
      <Text>
        RevenueCat handles test subscription identity and entitlements. Sentry
        receives filtered error events only when configured; this version
        removes user identity, request data, breadcrumbs and error content
        before sending JavaScript events. Provider infrastructure may separately
        process network metadata. No additional analytics service was
        identified.
      </Text>
      <Text>
        Saved interview content and attached recordings remain available until
        deleted; no age-based historical recording purge is enabled. Local
        recordings use app cache and are removed on normal discard or cleanup;
        force-close leftovers may remain until app or OS cleanup. Native session
        tokens use platform SecureStore. The web preview keeps sessions in
        browser session storage.
      </Text>
      <Text>
        Account deletion blocks practice access, requires fresh authentication,
        and queues retryable private-file and account cleanup.
        External-processor review is a required operator step. A job identifier,
        status and timestamps remain after completion without an account
        identifier. Backups and external systems are not erased instantly.
        Non-identifying webhook event IDs may remain for duplicate-event
        prevention. No legal-retention period is asserted without review.
      </Text>
      <Text>
        You may request access, correction, erasure or blocking, and raise
        privacy concerns through the privacy contact once configured. Applicable
        rights and exceptions depend on law, including the Philippine Data
        Privacy Act. Providers may process information internationally; hosting
        region and contractual safeguards must be confirmed before release.
      </Text>
      {user && !deletionPending
        ? (
          <Button
            title="Request a copy of my data"
            onPress={() => {
              void requestCopy();
            }}
          />
        )
        : null}
      {status ? <Text accessibilityRole="alert">{status}</Text> : null}
      <Link href="/account/delete">Request account deletion</Link>
      <Link href="/terms">Terms</Link>
    </ScrollView>
  );
}
