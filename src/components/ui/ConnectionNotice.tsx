import { Text, StyleSheet } from "react-native";
import { useBrowserOffline } from "@/hooks/useBrowserOffline";
import { colors } from "@/theme/colors";
export function ConnectionNotice() {
  const offline = useBrowserOffline();
  if (!offline) return null;
  return <Text accessibilityRole="alert" style={styles.notice}>You’re offline. Keep this page open to retain unsaved work. Reconnect, then retry any failed request.</Text>;
}
const styles = StyleSheet.create({ notice: { padding: 12, backgroundColor: colors.surface, color: colors.ink, textAlign: "center", fontSize: 13 } });
