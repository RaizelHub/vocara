import { Platform, type ViewStyle } from "react-native";
import { colors } from "./colors";

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 30,
  screenPadding: 20,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  card: 22,
  pill: 9999,
} as const;

export const shadows = {
  subtle: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#151515",
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    android: {
      elevation: 2,
    },
    web: {
      boxShadow: "0 2px 10px rgba(21, 21, 21, 0.04)",
    } as unknown as ViewStyle,
    default: {},
  }),
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#151515",
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    android: {
      elevation: 3,
    },
    web: {
      boxShadow: "0 6px 18px rgba(21, 21, 21, 0.06)",
    } as unknown as ViewStyle,
    default: {},
  }),
  elevated: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#151515",
      shadowOpacity: 0.09,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    android: {
      elevation: 6,
    },
    web: {
      boxShadow: "0 10px 28px rgba(21, 21, 21, 0.09)",
    } as unknown as ViewStyle,
    default: {},
  }),
  accentGlow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.accent,
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: {
      elevation: 4,
    },
    web: {
      boxShadow: "0 6px 16px rgba(255, 90, 54, 0.25)",
    } as unknown as ViewStyle,
    default: {},
  }),
} as const;
