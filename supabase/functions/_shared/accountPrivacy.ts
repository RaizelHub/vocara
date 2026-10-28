/** Backend gate supplements JWT validation: stale tokens cannot bypass deletion. */
export async function accountAccessResponse(
  admin: unknown,
  userId: string,
): Promise<Response | null> {
  const client = admin as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("account_is_active", {
    p_user_id: userId,
  });
  if (error) {
    return Response.json({
      code: "ACCOUNT_CHECK_UNAVAILABLE",
      message: "Account access could not be checked. Try again shortly.",
    }, { status: 503 });
  }
  return data === true ? null : Response.json({
    code: "ACCOUNT_UNAVAILABLE",
    message: "This account is deleted or awaiting deletion.",
  }, { status: 403 });
}

export function hasRecentAuthentication(
  claims: Record<string, unknown>,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (
    typeof claims.exp !== "number" || claims.exp <= nowSeconds ||
    claims.is_anonymous === true
  ) return false;
  return Array.isArray(claims.amr) && claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const a = entry as Record<string, unknown>;
    return ["password", "otp", "totp"].includes(String(a.method)) &&
      typeof a.timestamp === "number" && a.timestamp <= nowSeconds + 30 &&
      nowSeconds - a.timestamp <= 300;
  });
}

export type DeletionJob = {
  id: string;
  user_id: string;
  lease_token: string;
  processor_erasure_confirmed: boolean;
};
export type StoredObject = { bucket: string; name: string };
export type DeletionDependencies = {
  claim: () => Promise<DeletionJob | null>;
  list: (job: DeletionJob) => Promise<StoredObject[]>;
  remove: (bucket: string, paths: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
  finish: (job: DeletionJob, error: string | null) => Promise<void>;
};
/** A bounded, resumable unit. Never deletes SQL Storage metadata directly. */
export async function processDeletion(
  deps: DeletionDependencies,
): Promise<string> {
  const job = await deps.claim();
  if (!job) return "idle";
  try {
    // External processor erasure is explicitly verified by an operator; no claim
    // that deleting a Supabase row erases RevenueCat aliases or old crash reports.
    if (!job.processor_erasure_confirmed) {
      throw new Error("PROCESSOR_REVIEW_REQUIRED");
    }
    for (let batch = 0; batch < 5; batch++) {
      const objects = await deps.list(job);
      if (objects.length === 0) {
        await deps.deleteAuth(job.user_id);
        await deps.finish(job, null);
        return "completed";
      }
      for (const bucket of ["interview-audio", "speaking-audio", "resumes"]) {
        const paths = objects.filter((o) => o.bucket === bucket).map((o) =>
          o.name
        );
        if (paths.length) await deps.remove(bucket, paths);
      }
      if (
        objects.some((o) =>
          !["interview-audio", "speaking-audio", "resumes"].includes(o.bucket)
        )
      ) throw new Error("UNEXPECTED_BUCKET");
    }
    throw new Error("MORE_OBJECTS_REMAIN");
  } catch {
    await deps.finish(job, "CLEANUP_RETRY_REQUIRED");
    return "pending";
  }
}
