export type AuthOperation =
  | "signUp"
  | "signIn"
  | "resetPassword"
  | "updatePassword"
  | "callback"
  | "resendVerification"
  | "signOut";

type ErrorShape = {
  code?: string;
  message?: string;
  status?: number;
};

export function getAuthErrorMessage(error: unknown, operation: AuthOperation): string {
  const details = toErrorShape(error);
  const code = details.code?.toLowerCase() ?? "";
  const message = details.message?.toLowerCase() ?? "";

  if (__DEV__ && !isExpectedAuthFailure(code, message)) {
    // Logging the Error object with console.error opens React Native's error
    // overlay for handled Auth failures. Keep useful metadata without a stack.
    console.info("[VOCARA auth] Authentication request failed.");
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password")
  ) {
    return "The email or password you entered is incorrect.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email before logging in.";
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("auth_account_exists")
  ) {
    return "An account with this email already exists.";
  }

  if (code === "weak_password" || message.includes("password should be")) {
    return "Use a stronger password with at least 8 characters.";
  }

  if (code === "same_password" || message.includes("different from the old password")) {
    return "Choose a password you haven't used for this account.";
  }

  if (
    code.includes("expired") ||
    message.includes("expired") ||
    message.includes("token has expired")
  ) {
    return "This link has expired. Request a new email and try again.";
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  if (
    code.includes("rate_limit") ||
    details.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "Too many attempts. Wait a moment and try again.";
  }

  if (
    message.includes("error sending confirmation email") ||
    message.includes("email address not authorized") ||
    message.includes("smtp") ||
    message.includes("mailer")
  ) {
    return operation === "signUp"
      ? "We couldn't send your verification email right now. Please try again shortly."
      : "We couldn't send the email right now. Please try again shortly.";
  }

  if (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "We couldn't connect. Check your internet connection and try again.";
  }

  if (message.includes("signup is disabled")) {
    return "New account registration is temporarily unavailable.";
  }

  switch (operation) {
    case "resetPassword":
      return "We couldn't send the reset email. Please try again.";
    case "updatePassword":
      return "We couldn't update your password. Please try again.";
    case "callback":
      return "This link is invalid or has expired. Request a new email and try again.";
    case "resendVerification":
      return "We couldn't resend the verification email. Please try again.";
    case "signOut":
      return "We couldn't log you out. Please try again.";
    case "signUp":
      return "We couldn't create your account. Please try again.";
    default:
      return "We couldn't log you in. Please try again.";
  }
}

function isExpectedAuthFailure(code: string, message: string) {
  return (
    code === "invalid_credentials" ||
    code === "email_not_confirmed" ||
    code === "user_already_exists" ||
    code === "weak_password" ||
    code === "same_password" ||
    code === "email_address_invalid" ||
    code.includes("rate_limit") ||
    message.includes("invalid login credentials") ||
    message.includes("email not confirmed") ||
    message.includes("already registered") ||
    message.includes("password should be") ||
    message.includes("error sending confirmation email") ||
    message.includes("email address not authorized") ||
    message.includes("smtp") ||
    message.includes("mailer")
  );
}

function toErrorShape(error: unknown): ErrorShape {
  if (error instanceof Error) {
    const shaped = error as Error & ErrorShape;
    return { code: shaped.code, message: shaped.message, status: shaped.status };
  }

  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>;
    return {
      code: typeof value.code === "string" ? value.code : undefined,
      message: typeof value.message === "string" ? value.message : undefined,
      status: typeof value.status === "number" ? value.status : undefined,
    };
  }

  return {};
}
