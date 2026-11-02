export function webCallbackUrl(origin: string, flow: "verification" | "recovery") {
  const base = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && local)) {
    throw new Error("Open Vocara over HTTPS before requesting an authentication email.");
  }
  return `${base.origin}/auth/callback?flow=${flow}`;
}

export function createBrowserAuthStorage(getWindow: () => Pick<Window, "sessionStorage" | "localStorage"> | undefined) {
  function storage() {
    try { return getWindow()?.sessionStorage; } catch {
      throw new Error("Allow session storage for Vocara in your browser settings, then retry.");
    }
  }
  function removeLegacy(key: string) {
    // Blocked legacy storage must not prevent access to available session storage.
    try { getWindow()?.localStorage.removeItem(key); } catch { /* No legacy reads. */ }
  }
  return {
    async getItem(key: string) {
      removeLegacy(key);
      try { return storage()?.getItem(key) ?? null; } catch {
        throw new Error("Allow session storage for Vocara in your browser settings, then retry.");
      }
    },
    async setItem(key: string, value: string) {
      try { storage()?.setItem(key, value); } catch {
        throw new Error("Your browser could not save this session. Allow session storage and sign in again.");
      }
      removeLegacy(key);
    },
    async removeItem(key: string) {
      removeLegacy(key);
      try { storage()?.removeItem(key); } catch {
        throw new Error("Your browser could not clear the session. Close this tab and clear Vocara site data.");
      }
    },
  };
}
