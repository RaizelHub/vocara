import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { interviewSessionService } from '@/services/interviewSessionService';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors } from '@/theme/colors';

export function ResumeInterview() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => { setRetry(n => n + 1); }, []));
  useEffect(() => {
    if (retry === 0) return;
    let active = true;
    void interviewSessionService.recover().then(data => {
      if (active) { setSessionId(data?.session.id ?? null); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);
  if (!sessionId && !error) return null;
  return <View style={{ paddingHorizontal: 24, paddingBottom: 12, gap: 8 }}>
    {sessionId && <PrimaryButton label="Resume Interview" onPress={() => router.push({ pathname: '/interview/session', params: { id: sessionId } })} />}
    {error && <PressableScale onPress={() => setRetry(n => n + 1)} accessibilityLabel="Check for saved interviews again">
      <Text style={{ color: colors.secondary }}>Could not check saved interviews. Tap to retry.</Text>
    </PressableScale>}
  </View>;
}
