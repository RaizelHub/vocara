import * as Sentry from "@sentry/react-native";
import { sanitizeTelemetry } from "./privacyTelemetry";
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryEnabled = Boolean(dsn);
export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableNative: false,
    enableAutoSessionTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => sanitizeTelemetry(event),
    beforeSendTransaction: () => null,
  });
}
export function captureError(
  _error: unknown,
  _context?: Record<string, unknown>,
) {
  if (sentryEnabled) {
    Sentry.captureMessage(
      "Application error (private details removed)",
      "error",
    );
  }
}
export function setSentryUser(_userId: string | null | undefined) {
  if (sentryEnabled) Sentry.setUser(null);
}
