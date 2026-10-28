import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  type DeletionJob,
  processDeletion,
  type StoredObject,
} from "../_shared/accountPrivacy.ts";
export default {
  fetch: async (request: Request) => {
    if (request.method !== "POST") {
      return Response.json({
        code: "METHOD_NOT_ALLOWED",
      }, { status: 405 });
    }
    const secret = Deno.env.get("PRIVACY_WORKER_SECRET");
    const supplied =
      request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
    if (
      !secret || secret.length < 32 || !await sameSecret(secret, supplied)
    ) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      return Response.json({ code: "NOT_CONFIGURED" }, {
        status: 503,
      });
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    async function rpc(name: string, args: Record<string, unknown> = {}) {
      const r = await admin.rpc(name, args);
      if (r.error) throw new Error("DATABASE_OPERATION_FAILED");
      return r.data;
    }
    try {
      const status = await processDeletion({
        claim: async () =>
          await rpc("claim_account_deletion") as DeletionJob | null,
        list: async (job) =>
          await rpc("deletion_storage_batch", {
            p_job: job.id,
            p_lease: job.lease_token,
          }) as StoredObject[],
        remove: async (bucket, paths) => {
          const { error } = await admin.storage.from(bucket).remove(paths);
          if (error) throw new Error("STORAGE_CLEANUP_FAILED");
        },
        deleteAuth: async (userId) => {
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error && error.code !== "user_not_found") {
            throw new Error("AUTH_CLEANUP_FAILED");
          }
        },
        finish: async (job, error) => {
          await rpc("finish_account_deletion", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_error: error,
          });
        },
      });
      if (status === "idle") {
        const objects = await rpc("claim_orphan_private_files", {
          p_execute: true,
        }) as StoredObject[];
        for (const object of objects) {
          if (
            !["interview-audio", "speaking-audio", "resumes"].includes(
              object.bucket,
            )
          ) throw new Error("UNEXPECTED_BUCKET");
          const { error } = await admin.storage.from(object.bucket).remove([
            object.name,
          ]);
          if (error) throw new Error("STORAGE_CLEANUP_FAILED");
          await rpc("finish_orphan_private_file", {
            p_bucket: object.bucket,
            p_name: object.name,
          });
        }
      }
      return Response.json({ status }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ code: "CLEANUP_RETRY_REQUIRED" }, { status: 503 });
    }
  },
};
async function sameSecret(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
