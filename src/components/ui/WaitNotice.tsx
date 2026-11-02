import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useBrowserOffline } from "@/hooks/useBrowserOffline";
import { colors } from "@/theme/colors";
export function WaitNotice({ operation, light = false }: { operation: string; light?: boolean }) {
  return <TimedWaitNotice key={operation} light={light} />;
}
function TimedWaitNotice({ light }: { light: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const offline = useBrowserOffline();
  useEffect(() => {
    const slow = setTimeout(() => setElapsed(10), 10000);
    const delayed = setTimeout(() => setElapsed(30), 30000);
    return () => { clearTimeout(slow); clearTimeout(delayed); };
  }, []);
  const message = offline ? "You’re offline. Keep this screen open and reconnect before retrying."
    : elapsed >= 30 ? "Still waiting for the service. Check your connection; avoid submitting again while this request is pending."
    : elapsed >= 10 ? "This is taking longer than usual. Your request is still pending." : null;
  return message ? <Text accessibilityLiveRegion="polite" style={{ color: light ? "#B8B6AF" : colors.secondary, textAlign: "center", marginTop: 12, maxWidth: 440 }}>{message}</Text> : null;
}
