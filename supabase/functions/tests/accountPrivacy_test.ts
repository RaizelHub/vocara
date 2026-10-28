import { minimizeResumeContacts } from "../_shared/resumePrompts.ts";
import { deepStrictEqual as assertEquals } from "node:assert";
import {
  accountAccessResponse,
  type DeletionDependencies,
  type DeletionJob,
  hasRecentAuthentication,
  processDeletion,
} from "../_shared/accountPrivacy.ts";
import { deletionHandler } from "../_shared/deletionHttp.ts";
const identity = {
  id: "synthetic-owner",
  claims: {
    exp: Date.now() / 1000 + 3600,
    amr: [{ method: "password", timestamp: Date.now() / 1000 }],
  },
};
Deno.test("recent authentication uses AMR, not refreshed issuance time", () => {
  assertEquals(hasRecentAuthentication(identity.claims), true);
  assertEquals(
    hasRecentAuthentication({
      ...identity.claims,
      iat: Date.now() / 1000,
      amr: [{ method: "password", timestamp: 1 }],
    }),
    false,
  );
  assertEquals(hasRecentAuthentication({ ...identity.claims, exp: 1 }), false);
  assertEquals(
    hasRecentAuthentication({
      ...identity.claims,
      amr: [{ method: "recovery", timestamp: Date.now() / 1000 }],
    }),
    false,
  );
  assertEquals(
    hasRecentAuthentication({ ...identity.claims, is_anonymous: true }),
    false,
  );
});
Deno.test("unauthenticated and invalid credentials cannot initiate deletion", async () => {
  let calls = 0;
  const handler = deletionHandler({
    verify: async () => null,
    request: async () => {
      calls++;
    },
  });
  for (
    const headers of [
      new Headers(),
      new Headers({ authorization: "Bearer invalid" }),
    ]
  ) {
    const r = await handler(
      new Request("https://test.invalid", {
        method: "POST",
        headers,
        body: '{"confirmation":"DELETE"}',
      }),
    );
    assertEquals(r.status, 401);
  }
  assertEquals(calls, 0);
});
Deno.test("deletion ignores no client identity: any supplied user id is rejected", async () => {
  const ids: string[] = [];
  const handler = deletionHandler({
    verify: async () => identity,
    request: async (id) => {
      ids.push(id);
    },
  });
  const request = (body: unknown) =>
    new Request("https://test.invalid", {
      method: "POST",
      headers: { authorization: "Bearer verified" },
      body: JSON.stringify(body),
    });
  assertEquals(
    (await handler(request({ confirmation: "DELETE", userId: "victim" })))
      .status,
    400,
  );
  assertEquals(
    (await handler(request({ confirmation: "DELETE" }))).status,
    202,
  );
  assertEquals(ids, [identity.id]);
});
Deno.test("deletion rejects stale authentication, missing confirmation and unknown web origins", async () => {
  let calls = 0;
  const handler = deletionHandler({
    verify: async () => ({
      ...identity,
      claims: { ...identity.claims, amr: [] },
    }),
    request: async () => {
      calls++;
    },
  });
  assertEquals(
    (await handler(
      new Request("https://test.invalid", {
        method: "POST",
        headers: { authorization: "Bearer verified" },
        body: '{"confirmation":"DELETE"}',
      }),
    )).status,
    403,
  );
  assertEquals(
    (await handler(
      new Request("https://test.invalid", {
        method: "OPTIONS",
        headers: { origin: "https://evil.invalid" },
      }),
    )).status,
    403,
  );
  assertEquals(calls, 0);
});
Deno.test("pending, deleted and failed account checks stop privileged work", async () => {
  assertEquals(
    await accountAccessResponse({
      rpc: () => Promise.resolve({ data: true, error: null }),
    }, "owner"),
    null,
  );
  assertEquals(
    (await accountAccessResponse({
      rpc: () => Promise.resolve({ data: false, error: null }),
    }, "owner"))?.status,
    403,
  );
  assertEquals(
    (await accountAccessResponse({
      rpc: () => Promise.resolve({ data: null, error: { message: "secret" } }),
    }, "owner"))?.status,
    503,
  );
});
const job: DeletionJob = {
  id: "job",
  user_id: "owner",
  lease_token: "lease",
  processor_erasure_confirmed: true,
};
Deno.test("worker failure preserves Auth and retries Storage before final deletion", async () => {
  let objects = [{ bucket: "resumes", name: "owner/resume.pdf" }];
  let fail = true;
  const sequence: string[] = [];
  const deps: DeletionDependencies = {
    claim: async () => job,
    list: async () => objects,
    remove: async () => {
      sequence.push("remove");
      if (fail) throw new Error("network");
      objects = [];
    },
    deleteAuth: async (id) => {
      assertEquals(id, "owner");
      sequence.push("auth");
    },
    finish: async (_, error) => {
      sequence.push(error ? "pending" : "complete");
    },
  };
  assertEquals(await processDeletion(deps), "pending");
  assertEquals(sequence, ["remove", "pending"]);
  fail = false;
  assertEquals(await processDeletion(deps), "completed");
  assertEquals(sequence, ["remove", "pending", "remove", "auth", "complete"]);
});
Deno.test("worker does not erase Auth without processor review or duplicate lease", async () => {
  let writes = 0;
  const deps: DeletionDependencies = {
    claim: async () => ({ ...job, processor_erasure_confirmed: false }),
    list: async () => [],
    remove: async () => {
      writes++;
    },
    deleteAuth: async () => {
      writes++;
    },
    finish: async () => {},
  };
  assertEquals(await processDeletion(deps), "pending");
  assertEquals(writes, 0);
  deps.claim = async () => null;
  assertEquals(await processDeletion(deps), "idle");
  assertEquals(writes, 0);
});
Deno.test("worker resumes after Auth deletion succeeds but completion persistence fails", async () => {
  let deleted = false, failFinish = true;
  const deps: DeletionDependencies = {
    claim: async () => job,
    list: async () => [],
    remove: async () => {},
    deleteAuth: async () => {
      deleted = true;
    },
    finish: async (_, error) => {
      if (!error && failFinish) throw new Error("lost response");
    },
  };
  assertEquals(await processDeletion(deps), "pending");
  assertEquals(deleted, true);
  failFinish = false;
  assertEquals(await processDeletion(deps), "completed");
});

Deno.test("resume contact minimization preserves work dates and relevant experience", () => {
  assertEquals(
    minimizeResumeContacts(
      "Engineer 2018-2020. Contact synthetic@example.invalid or +63 917 123 4567.",
    ),
    "Engineer 2018-2020. Contact [email omitted] or [phone omitted].",
  );
});
