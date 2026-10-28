import { strict as assert } from "node:assert";
import {
  aiClaimError,
  fetchGroqJson,
  ProviderError,
  providerHttpError,
  retryAfterSeconds,
  validateTokenBudget,
} from "../_shared/aiProvider.ts";
import { requestStructuredEvaluation } from "../_shared/groq.ts";

function harness() {
  const records: Record<string, unknown>[] = [];
  let sent = false;
  const admin = {
    rpc(_name: string, args: Record<string, unknown>) {
      const data = args.p_data as Record<string, unknown>;
      if (data.provider_status === "sent" && sent) {
        return Promise.resolve({
          data: null,
          error: { message: "AI_PROVIDER_ALREADY_SENT" },
        });
      }
      if (data.provider_status === "sent") sent = true;
      records.push(data);
      return Promise.resolve({ data: "usage-id", error: null });
    },
  };
  const usage = {
    admin,
    userId: "synthetic-user",
    operationId: "synthetic-operation",
    source: "ai_evaluation_requests",
  };
  const input = {
    url: "https://provider.invalid",
    apiKey: "synthetic-secret",
    model: "openai/gpt-oss-120b",
    body: "{}",
    usage,
    inputUpperBound: 2,
    outputLimit: 1600,
  };
  return { records, input };
}
Deno.test("records provider measurements once without prompts or credentials", async () => {
  const h = harness();
  let calls = 0;
  const fetcher = (() => {
    calls++;
    return Promise.resolve(
      Response.json({
        usage: { prompt_tokens: 25, completion_tokens: 10 },
        choices: [{ message: { content: "private transcript" } }],
      }),
    );
  }) as typeof fetch;
  await fetchGroqJson({ ...h.input, fetcher });
  assert.equal(h.records[1].input_tokens, 25);
  assert.equal(h.records[1].output_tokens, 10);
  assert.equal(h.records[1].provider_status, "succeeded");
  assert.equal(JSON.stringify(h.records).includes("synthetic-secret"), false);
  assert.equal(JSON.stringify(h.records).includes("private transcript"), false);
  await assert.rejects(
    () => fetchGroqJson({ ...h.input, fetcher }),
    /safely recorded/,
  );
  assert.equal(calls, 1);
});
Deno.test("429 records retry-after and does not sleep or retry automatically", async () => {
  const h = harness();
  let calls = 0;
  await assert.rejects(
    () =>
      fetchGroqJson({
        ...h.input,
        fetcher: (() => {
          calls++;
          return Promise.resolve(
            Response.json({ error: { message: "sensitive upstream detail" } }, {
              status: 429,
              headers: { "Retry-After": "17" },
            }),
          );
        }) as typeof fetch,
      }),
    (e: unknown) =>
      e instanceof ProviderError && e.retryAfterSeconds === 17 &&
      !e.message.includes("sensitive"),
  );
  assert.equal(calls, 1);
  assert.equal(h.records[1].retry_after_seconds, 17);
  assert.equal(h.records[1].provider_status, "rejected");
});
Deno.test("retry-after supports HTTP dates and invalid values", () => {
  const now = Date.parse("2026-10-28T00:00:00Z");
  assert.equal(retryAfterSeconds("Wed, 28 Oct 2026 00:00:30 GMT", now), 30);
  assert.equal(retryAfterSeconds("invalid", now), 5);
});
Deno.test("network interruption is recorded as unknown without blind retry", async () => {
  const h = harness();
  let calls = 0;
  await assert.rejects(() =>
    fetchGroqJson({
      ...h.input,
      fetcher: (() => {
        calls++;
        throw new TypeError("private network detail");
      }) as typeof fetch,
    }), /interrupted/);
  assert.equal(calls, 1);
  assert.equal(h.records[1].provider_status, "unknown");
  assert.equal(h.records[1].input_tokens, undefined);
});
Deno.test("deadline covers a stalled response body", async () => {
  const h = harness();
  const fetcher = ((_url: unknown, init: RequestInit) =>
    Promise.resolve({
      json: () =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")))
        ),
    } as Response)) as typeof fetch;
  await assert.rejects(
    () => fetchGroqJson({ ...h.input, timeoutMs: 5, fetcher }),
    (e: unknown) => e instanceof ProviderError && e.code === "GROQ_TIMEOUT",
  );
  assert.equal(h.records[1].provider_status, "unknown");
});

Deno.test("body connection failure remains an uncertain provider outcome", async () => {
  const h = harness();
  const fetcher = (() => Promise.resolve({
    json: () => Promise.reject(new TypeError("body connection lost")),
  } as Response)) as typeof fetch;
  await assert.rejects(() => fetchGroqJson({ ...h.input, fetcher }), /interrupted/);
  assert.equal(h.records[1].provider_status, "unknown");
});
Deno.test("accounting failure and missing authorization prevent provider calls", async () => {
  const h = harness();
  let calls = 0;
  h.input.usage.admin.rpc = () =>
    Promise.resolve({
      data: null,
      error: { message: "AI_USAGE_CLAIM_REQUIRED" },
    });
  await assert.rejects(() =>
    fetchGroqJson({
      ...h.input,
      fetcher: (() => {
        calls++;
        return Promise.resolve(Response.json({}));
      }) as typeof fetch,
    })
  );
  assert.equal(calls, 0);
});
Deno.test("token and audio boundaries reject excess before recording or fetching", async () => {
  validateTokenBudget(120000, 3200);
  assert.throws(() => validateTokenBudget(120001, 3200));
  assert.throws(() => validateTokenBudget(1, 3201));
  const h = harness();
  await assert.rejects(
    () => fetchGroqJson({ ...h.input, audioSeconds: 121 }),
    /120 seconds/,
  );
  assert.equal(h.records.length, 0);
  await fetchGroqJson({
    ...h.input,
    audioSeconds: 120,
    fetcher: (() =>
      Promise.resolve(
        Response.json({ text: "Synthetic speech" }),
      )) as typeof fetch,
  });
  assert.equal(h.records[0].audio_seconds, 120);
});
Deno.test("provider errors use safe actionable categories", () => {
  for (
    const [status, code] of [
      [401, "EVALUATION_NOT_CONFIGURED"],
      [402, "GROQ_BUDGET_LIMIT"],
      [404, "GROQ_MODEL_UNAVAILABLE"],
      [422, "GROQ_INVALID_REQUEST"],
    ] as const
  ) {
    const error = providerHttpError(status, null);
    assert.equal(error.code, code);
    assert.equal(error.retryable, false);
  }
  assert.equal(
    providerHttpError(429, null, "insufficient_quota").code,
    "GROQ_BUDGET_LIMIT",
  );
  assert.equal(
    providerHttpError(400, null, "model_decommissioned").code,
    "GROQ_MODEL_UNAVAILABLE",
  );
  assert.equal(
    aiClaimError({ message: "AI_USER_OPERATION_ACTIVE" })?.status,
    429,
  );
  assert.equal(aiClaimError({ message: "UNRELATED" }), null);
});
Deno.test("malformed successful response still records measured usage as unknown rather than zero", async () => {
  const h = harness();
  const result = await fetchGroqJson({
    ...h.input,
    fetcher: (() => Promise.resolve(new Response("not json"))) as typeof fetch,
  });
  assert.equal(result.payload, null);
  assert.equal(h.records[1].input_tokens, null);
});
Deno.test("structured response preserves quality parameters and reports usage", async () => {
  const h = harness();
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.temperature, 0.5);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.max_completion_tokens, 1600);
    assert.equal(body.stream, false);
    return Promise.resolve(
      Response.json({
        choices: [{ message: { content: '{"score":80}' } }],
        usage: { prompt_tokens: 40, completion_tokens: 5 },
      }),
    );
  }) as typeof fetch;
  try {
    const result = await requestStructuredEvaluation({
      config: {
        apiKey: "synthetic",
        model: "openai/gpt-oss-120b",
        version: "test",
        reasoningEffort: "low",
      },
      usage: h.input.usage,
      userId: "synthetic-user",
      instructions: "Evaluate evidence",
      content: "Synthetic answer",
      schema: {},
      schemaName: "test",
      maxCompletionTokens: 1600,
    });
    assert.deepEqual(result.value, { score: 80 });
    assert.equal(result.inputTokens, 40);
  } finally {
    globalThis.fetch = original;
  }
});
