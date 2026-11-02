import { Platform, StyleSheet, View, useWindowDimensions, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(focused: IconName, unfocused: IconName) {
  return function TabIcon({
    color,
    focused: isFocused,
  }: {
    color: ColorValue;
    focused: boolean;
  }) {
    return (
      <View style={[styles.iconWrap, isFocused && styles.iconWrapFocused]}>
        <Ionicons
          name={(isFocused ? focused : unfocused) as IconName}
          size={21}
          color={color}
        />
      </View>
    );
  };
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1024;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: desktop ? "left" : "bottom",
        tabBarLabelPosition: desktop ? "beside-icon" : "below-icon",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondary,
        tabBarActiveBackgroundColor: desktop ? colors.accentLight : undefined,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
          ...Platform.select({
            ios: {
              shadowColor: "#151515",
              shadowOpacity: 0.04,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: -4 },
            },
            android: {
              elevation: 8,
            },
            web: {
              boxShadow: "0 -2px 12px rgba(21, 21, 21, 0.04)",
            },
            default: {},
          }),
          ...(desktop ? { height: "100%", width: 200, minWidth: 200, maxWidth: 200, paddingTop: 24, borderTopWidth: 0, borderRightWidth: 1, borderRightColor: colors.borderSubtle } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.2,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: tabIcon("home", "home-outline"),
        }}
      />
      <Tabs.Screen
        name="resume"
        options={{
          title: "Resume",
          tabBarIcon: tabIcon("document-text", "document-text-outline"),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: "Practice",
          tabBarIcon: tabIcon("mic", "mic-outline"),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: tabIcon("stats-chart", "stats-chart-outline"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: tabIcon("person", "person-outline"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 38,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapFocused: {
    backgroundColor: colors.accentLight,
  },
});
