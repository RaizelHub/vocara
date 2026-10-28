import { ScrollView, Text } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export default function Terms() {
  const insets = useSafeAreaInsets();
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
        Vocara Terms � review draft
      </Text>
      <Text>
        Operator: [LEGAL / OPERATOR NAME]. Contact: [CONTACT EMAIL]. Effective
        date: [AFTER REVIEW]. These draft terms require legal review before
        public release.
      </Text>
      <Text>
        Vocara provides interview practice and AI-generated coaching. Feedback
        may be inaccurate and does not guarantee employment or professional
        advice. Review it using your own judgment.
      </Text>
      <Text>
        Submit only material you are authorized to use. Keep account credentials
        private. Do not misuse the service, bypass limits, access another
        user&apos;s information or upload harmful files.
      </Text>
      <Text>
        Availability and practice allowances may be limited. RevenueCat is used
        only for testing; this phase does not activate paid subscriptions. Store
        subscription cancellation and account deletion are different processes.
      </Text>
      <Text>
        You can request account deletion through the linked verification flow.
        Processing, retention and privacy rights are described in the privacy
        notice. Governing law, age eligibility, dispute procedures and any
        consumer-law terms require operator and legal review; none are invented
        here.
      </Text>
      <Link href="/privacy">Privacy Policy</Link>
      <Link href="/account/delete">Delete Account</Link>
    </ScrollView>
  );
}
