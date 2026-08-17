export function getDataErrorMessage(error: unknown, fallback: string): string {
  if (__DEV__) console.error("[VOCARA data]", error);

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "We couldn't connect. Check your internet connection and try again.";
  }

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Your session no longer has access. Log in again and retry.";
  }

  return fallback;
}

export function isAuthenticationError(error: unknown) {
  const details = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const status = Number(details?.status ?? details?.statusCode);
  const code = typeof details?.code === "string" ? details.code.toLowerCase() : "";
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof details?.message === "string"
        ? details.message.toLowerCase()
        : "";

  return (
    status === 401 ||
    code === "pgrst301" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("refresh token") ||
    message.includes("session expired") ||
    message.includes("not authenticated")
  );
}
