import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { deletionHandler } from "../_shared/deletionHttp.ts";
export default {
  fetch: async (request: Request) => {
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const workerSecret = Deno.env.get("PRIVACY_WORKER_SECRET");
    if (!workerSecret || workerSecret.length < 32) {
      return Response.json({
        code: "DELETION_NOT_CONFIGURED",
      }, { status: 503 });
    }
    if (!url || !key) {
      return Response.json({ code: "NOT_CONFIGURED" }, {
        status: 503,
      });
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    });
    return deletionHandler(
      {
        verify: async (token) => {
          const user = await admin.auth.getUser(token);
          if (user.error || !user.data.user) return null;
          const claims = await admin.auth.getClaims(token);
          if (
            claims.error || !claims.data ||
            claims.data.claims.sub !== user.data.user.id
          ) return null;
          return { id: user.data.user.id, claims: claims.data.claims };
        },
        request: async (id) => {
          const { error } = await admin.rpc("request_account_deletion", {
            p_user_id: id,
          });
          if (error) throw new Error("REQUEST_FAILED");
        },
      },
      (Deno.env.get("PRIVACY_ALLOWED_WEB_ORIGINS") ?? "").split(",").map((s) =>
        s.trim()
      ).filter(Boolean),
    )(request);
  },
};
