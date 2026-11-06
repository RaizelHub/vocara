import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { interviewSessionService } from '@/services/interviewSessionService';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors } from '@/theme/colors';
import { useAuth } from '@/providers/AuthProvider';
import { recoveryReference } from '@/lib/recoveryReference';

export function ResumeInterview() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resolvedOwner, setResolvedOwner] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => { setRetry(n => n + 1); }, []));
  useEffect(() => {
    if (retry === 0 || !user) return;
    let active = true;
    void (async () => {
      const reference = await recoveryReference.read(user.id).catch(() => null);
      if (reference) {
        const saved = await interviewSessionService.recover(reference);
        if (saved && !['completed', 'abandoned'].includes(saved.session.status)) return saved;
        await recoveryReference.clear(user.id).catch(() => undefined);
      }
      return interviewSessionService.recover();
    })().then(data => {
      const isResumable = data?.session && !['completed', 'abandoned'].includes(data.session.status);
      if (active) { setSessionId(isResumable ? data.session.id : null); setResolvedOwner(user.id); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry, user]);
  const ownSessionId = resolvedOwner === user?.id ? sessionId : null;
  if (!ownSessionId && !error) return null;
  return <View style={{ paddingHorizontal: 24, paddingBottom: 12, gap: 8 }}>
    {ownSessionId && <PrimaryButton label="Resume Interview" onPress={() => router.push({ pathname: '/interview/session', params: { id: ownSessionId } })} />}
    {error && <PressableScale onPress={() => setRetry(n => n + 1)} accessibilityLabel="Check for saved interviews again">
      <Text style={{ color: colors.secondary }}>Could not check saved interviews. Tap to retry.</Text>
    </PressableScale>}
  </View>;
}
