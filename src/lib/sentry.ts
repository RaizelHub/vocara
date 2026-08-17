import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

export function initSentry() {
  if (!dsn) {
    if (__DEV__) console.warn("[VOCARA] EXPO_PUBLIC_SENTRY_DSN is not set; Sentry disabled.");
    return;
  }
  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: __DEV__ ? 0 : 0.1,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!sentryEnabled) return;
  const scope = Sentry.getGlobalScope();
  if (context) scope.setContext("extra", context);
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(
      typeof error === "string" ? error : "Unknown application error",
      "error",
    );
  }
}

export function setSentryUser(userId: string | null | undefined) {
  if (!sentryEnabled) return;
  const scope = Sentry.getGlobalScope();
  if (userId) {
    scope.setUser({ id: userId });
  } else {
    scope.setUser(null);
  }
}
