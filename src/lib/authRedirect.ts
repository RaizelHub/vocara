export function authCallbackUrl(flow: "verification" | "recovery") {
  return `vocara://auth/callback?flow=${flow}`;
}
