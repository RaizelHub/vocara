import { expect, it, vi, afterEach } from "vitest";
import { createBrowserAuthStorage, webCallbackUrl } from "./webAuth";
import { authCallbackUrl as browserCallback } from "./authRedirect.web";

afterEach(() => vi.unstubAllGlobals());
it("retains native deep links and uses the browser origin without redirect input", () => {
  vi.stubGlobal("window", { location: { origin: "https://practice.example.invalid" } });
  expect(browserCallback("verification")).toBe("https://practice.example.invalid/auth/callback?flow=verification");
  expect(webCallbackUrl("https://practice.example.invalid/?redirect=https://evil.invalid", "recovery")).toBe("https://practice.example.invalid/auth/callback?flow=recovery");
});
it("allows local HTTP but rejects insecure remote authentication origins", () => {
  expect(webCallbackUrl("http://localhost:8092", "recovery")).toContain("http://localhost:8092/auth/callback");
  expect(() => webCallbackUrl("http://example.invalid", "verification")).toThrow("HTTPS");
  expect(() => webCallbackUrl("javascript:alert(1)", "verification")).toThrow("HTTPS");
});
function fixture() {
  const values = new Map<string, string>();
  const sessionStorage = { getItem: vi.fn((k: string) => values.get(k) ?? null), setItem: vi.fn((k: string, v: string) => { values.set(k, v); }), removeItem: vi.fn((k: string) => { values.delete(k); }) } as unknown as Storage;
  const localStorage = { removeItem: vi.fn() } as unknown as Storage;
  return { sessionStorage, localStorage };
}
it("restores across adapter recreation in the same tab and removes tokens on logout", async () => {
  const browser = fixture();
  const first = createBrowserAuthStorage(() => browser);
  await first.setItem("auth", "synthetic-session");
  const reloaded = createBrowserAuthStorage(() => browser);
  expect(await reloaded.getItem("auth")).toBe("synthetic-session");
  await reloaded.removeItem("auth");
  expect(await first.getItem("auth")).toBeNull();
  expect(browser.localStorage.removeItem).toHaveBeenCalledWith("auth");
});
it("blocked legacy storage does not break available session storage", async () => {
  const browser = fixture();
  Object.defineProperty(browser, "localStorage", { get() { throw new Error("SecurityError"); } });
  const storage = createBrowserAuthStorage(() => browser);
  await storage.setItem("auth", "synthetic");
  expect(await storage.getItem("auth")).toBe("synthetic");
});
it("blocked session storage fails explicitly without a persistent plaintext fallback", async () => {
  const browser = fixture();
  Object.defineProperty(browser, "sessionStorage", { get() { throw new Error("SecurityError"); } });
  const storage = createBrowserAuthStorage(() => browser);
  await expect(storage.getItem("auth")).rejects.toThrow("Allow session storage");
  await expect(storage.setItem("auth", "synthetic")).rejects.toThrow("could not save");
  await expect(storage.removeItem("auth")).rejects.toThrow("could not clear");
});
it("server rendering has no shared in-memory token persistence", async () => {
  const storage = createBrowserAuthStorage(() => undefined);
  await storage.setItem("auth", "synthetic");
  expect(await storage.getItem("auth")).toBeNull();
});
