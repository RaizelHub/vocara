import type { ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";
import { authStyles } from "@/components/auth/authStyles";

export type AuthScreenProps = {
  children: ReactNode;
};

/**
 * The skeleton every auth screen shares: keyboard-avoiding scroll canvas
 * with generous breathing room and safe-area-friendly padding. Forms
 * scroll out of the keyboard's way, so the primary CTA stays reachable.
 */
export function AuthScreen({ children }: AuthScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: authStyles.horizontalPadding,
    paddingTop: 6,
  },
  inner: {
    flexGrow: 1,
    width: "100%",
    maxWidth: authStyles.contentMaxWidth,
    alignSelf: "center",
  },
});
