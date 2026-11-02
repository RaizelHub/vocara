import { createBrowserAuthStorage } from "./webAuth";

// No native modules or shared server-side token cache in the browser adapter.
export const authStorage = createBrowserAuthStorage(() =>
  typeof window === "undefined" ? undefined : window,
);
