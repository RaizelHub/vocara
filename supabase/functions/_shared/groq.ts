import {
  fetchGroqJson,
  ProviderError as EvaluationFunctionError,
  type UsageContext,
} from "./aiProvider.ts";
export { ProviderError as EvaluationFunctionError } from "./aiProvider.ts";
import {
  ALLOWED_EVALUATION_MODELS,
  ALLOWED_REASONING_EFFORTS,
  DEFAULT_EVALUATION_MODEL,
  DEFAULT_EVALUATION_VERSION,
  DEFAULT_REASONING_EFFORT,
} from "./evaluationConfig.ts";

// Retained call shape; retries must acquire a new durable claim. One claim = one
// provider attempt, including invalid responses and uncertain network outcomes.
export async function withGroqRetry<T>(
  run: (attempt: number) => Promise<T>,
  _options?: { maxAttempts: 1 },
) {
  return await run(1);
}

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export type EvaluationConfig = {
  apiKey: string;
  model: string;
  version: string;
  reasoningEffort: string;
};

export type StructuredEvaluationResult = {
  value: unknown;
  model: string;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  systemFingerprint: string | null;
};

export function getEvaluationConfig(): EvaluationConfig {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const model = Deno.env.get("GROQ_EVALUATION_MODEL")?.trim() ||
    DEFAULT_EVALUATION_MODEL;
  const version = Deno.env.get("VOCARA_EVALUATION_VERSION")?.trim() ||
    DEFAULT_EVALUATION_VERSION;
  const reasoningEffort = Deno.env.get("GROQ_EVALUATION_REASONING")?.trim() ||
    DEFAULT_REASONING_EFFORT;
  if (!apiKey || !ALLOWED_EVALUATION_MODELS.has(model)) {
    throw new EvaluationFunctionError(
      500,
      "EVALUATION_NOT_CONFIGURED",
      "AI feedback is not configured yet.",
      false,
    );
  }
  if (
    !/^[a-zA-Z0-9._-]{1,40}$/.test(version) ||
    !ALLOWED_REASONING_EFFORTS.has(reasoningEffort)
  ) {
    throw new EvaluationFunctionError(
      500,
      "EVALUATION_NOT_CONFIGURED",
      "AI feedback configuration is invalid.",
      false,
    );
  }
  return { apiKey, model, version, reasoningEffort };
}

export async function requestStructuredEvaluation(input: {
  config: EvaluationConfig;
  usage: UsageContext;
  schemaName: string;
  schema: unknown;
  instructions: string;
  content: string;
  userId: string;
  maxCompletionTokens: number;
  seed?: number;
}): Promise<StructuredEvaluationResult> {
  const body = JSON.stringify({
    model: input.config.model,
    messages: [
      { role: "system", content: input.instructions },
      { role: "user", content: input.content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
    reasoning_effort: resolveReasoningEffort(
      input.config.model,
      input.config.reasoningEffort,
    ),
    include_reasoning: false,
    temperature: 0.5,
    seed: input.seed ?? 42,
    max_completion_tokens: input.maxCompletionTokens,
    stream: false,
    user: await createSafetyIdentifier(input.userId),
  });
  // UTF-8 bytes conservatively bound token count, including schema overhead.
  const inputUpperBound = new TextEncoder().encode(body).length;
  const { payload, response } = await fetchGroqJson({
    url: GROQ_CHAT_URL,
    apiKey: input.config.apiKey,
    model: input.config.model,
    body,
    usage: input.usage,
    inputUpperBound,
    outputLimit: input.maxCompletionTokens,
  });

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new EvaluationFunctionError(
      502,
      "GROQ_INVALID_RESPONSE",
      "AI feedback returned an invalid response. Please retry.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new EvaluationFunctionError(
      502,
      "GROQ_INVALID_RESPONSE",
      "AI feedback returned an invalid response. Please retry.",
    );
  }
  return {
    value,
    model: typeof payload?.model === "string"
      ? payload.model
      : input.config.model,
    requestId: typeof payload?.x_groq?.id === "string"
      ? payload.x_groq.id
      : response.headers.get("x-request-id") ??
        (typeof payload?.id === "string" ? payload.id : null),
    inputTokens: integerOrNull(payload?.usage?.prompt_tokens),
    outputTokens: integerOrNull(payload?.usage?.completion_tokens),
    systemFingerprint: typeof payload?.system_fingerprint === "string"
      ? payload.system_fingerprint
      : null,
  };
}

function resolveReasoningEffort(model: string, reasoningEffort: string) {
  if (model.startsWith("qwen/")) {
    return reasoningEffort === "none" ? "none" : "default";
  }
  return reasoningEffort;
}

async function createSafetyIdentifier(userId: string) {
  const bytes = new TextEncoder().encode(`vocara-evaluation:${userId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function integerOrNull(value: unknown) {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}
