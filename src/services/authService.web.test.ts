import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { authService } from "./authService";
const { auth } = vi.hoisted(() => ({ auth: { signUp: vi.fn(), resetPasswordForEmail: vi.fn(), resend: vi.fn(), setSession: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth }, assertSupabaseConfigured: vi.fn() }));
vi.mock("@/lib/authRedirect", async () => import("@/lib/authRedirect.web"));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { location: { origin: "https://practice.example.invalid" } }); });
afterEach(() => vi.unstubAllGlobals());
it("uses web callbacks for signup, recovery and resend without caller redirect input", async () => {
  auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({error:null});
  auth.resend.mockResolvedValue({error:null});
  await authService.signUp({fullName:"Fixture",email:"fixture@example.invalid",password:"synthetic"});
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({options:expect.objectContaining({emailRedirectTo:"https://practice.example.invalid/auth/callback?flow=verification"})}));
  await authService.resetPassword("fixture@example.invalid");
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("fixture@example.invalid",{redirectTo:"https://practice.example.invalid/auth/callback?flow=recovery"});
  await authService.resendVerification("fixture@example.invalid");
  expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({options:{emailRedirectTo:"https://practice.example.invalid/auth/callback?flow=verification"}}));
});
it("consumes browser recovery fragments once through existing Supabase authentication", async () => {
  auth.setSession.mockResolvedValue({error:null});
  const url="https://practice.example.invalid/auth/callback#access_token=synthetic&refresh_token=synthetic-refresh&type=recovery";
  await expect(authService.consumeCallback(url)).resolves.toBe("recovery");
  await authService.consumeCallback(url);
  expect(auth.setSession).toHaveBeenCalledTimes(1);
});
