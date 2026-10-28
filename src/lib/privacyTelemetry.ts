/** Strict allowlist: no request, user, breadcrumb, context, attachment or error text. */
export function sanitizeTelemetry<T extends object>(event: T): T {
  const safe: Record<string, unknown> = {
    message: "Application error (private details removed)",
    level: "error",
  };
  for (
    const key of [
      "event_id",
      "timestamp",
      "platform",
      "release",
      "dist",
      "environment",
    ]
  ) {
    const value = (event as Record<string, unknown>)[key];
    if (typeof value === "string" || typeof value === "number") {
      safe[key] = value;
    }
  }
  return safe as T;
}
