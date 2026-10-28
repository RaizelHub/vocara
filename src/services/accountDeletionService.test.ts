import { beforeEach, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "./accountDeletionService";
const { signIn, invoke, signOut } = vi.hoisted(() => ({
  signIn: vi.fn(),
  invoke: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock(
  "@/lib/supabase",
  () => ({
    assertSupabaseConfigured: vi.fn(),
    supabasePublicConfig: {
      url: "https://synthetic.invalid",
      publishableKey: "synthetic",
    },
  }),
);
vi.mock(
  "@supabase/supabase-js",
  () => ({
    createClient: () => ({
      auth: { signInWithPassword: signIn, signOut },
      functions: { invoke },
    }),
  }),
);
beforeEach(() => {
  vi.resetAllMocks();
  signOut.mockResolvedValue({ error: null });
});
it("failed identity verification never requests deletion", async () => {
  signIn.mockResolvedValue({ error: { message: "private upstream message" } });
  await expect(requestAccountDeletion("synthetic@example.invalid", "bad"))
    .rejects.toThrow("Identity verification failed");
  expect(invoke).not.toHaveBeenCalled();
});
it("request sends confirmation only after fresh authentication", async () => {
  signIn.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ data: { code: "DELETION_PENDING" }, error: null });
  await requestAccountDeletion("synthetic@example.invalid", "synthetic");
  expect(invoke).toHaveBeenCalledWith("request-account-deletion", {
    body: { confirmation: "DELETE" },
  });
});
it("ambiguous backend response never claims successful deletion", async () => {
  signIn.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ data: null, error: { message: "offline" } });
  await expect(requestAccountDeletion("synthetic@example.invalid", "synthetic"))
    .rejects.toThrow("could not confirm");
});
