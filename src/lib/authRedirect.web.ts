import { webCallbackUrl } from "./webAuth";

export function authCallbackUrl(flow: "verification" | "recovery") {
  if (typeof window === "undefined") throw new Error("Open Vocara in your browser to continue.");
  return webCallbackUrl(window.location.origin, flow);
}
