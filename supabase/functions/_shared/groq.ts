import {
  ALLOWED_EVALUATION_MODELS,
  ALLOWED_REASONING_EFFORTS,
  DEFAULT_EVALUATION_MODEL,
  DEFAULT_EVALUATION_VERSION,
  DEFAULT_REASONING_EFFORT,
} from "./evaluationConfig.ts";

export const RETRYABLE_GROQ_CODES = new Set([
  "GROQ_TIMEOUT",
  "GROQ_UNAVAILABLE",
  "GROQ_RATE_LIMIT",
  "GROQ_ERROR",
  "GROQ_INVALID_REQUEST",
  "GROQ_INVALID_RESPONSE",
]);

export function isRetryableGroqError(error: unknown) {
  return error instanceof EvaluationFunctionError &&
    RETRYABLE_GROQ_CODES.has(error.code);
}

export async function withGroqRetry<T>(run: (attempt: number) => Promise<T>, options?: { maxAttempts: 1 | 3 }) {
  const maxAttempts = options?.maxAttempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableGroqError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 1_000 * Math.pow(2, attempt - 1))
      );
    }
  }
  throw lastError;
}

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const EVALUATION_TIMEOUT_MS = 75_000;

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

export class EvaluationFunctionError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, code: string, message: string, retryable = true) {
    super(message);
    this.name = "EvaluationFunctionError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

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
  schemaName: string;
  schema: unknown;
  instructions: string;
  content: string;
  userId: string;
  maxCompletionTokens: number;
  seed?: number;
}): Promise<StructuredEvaluationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EVALUATION_TIMEOUT_MS);
  let response: Response;
  let payload: GroqResponse | null;
  try {
    response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
        reasoning_effort: resolveReasoningEffort(input.config.model, input.config.reasoningEffort),
        include_reasoning: false,
        temperature: 0.5,
        seed: input.seed ?? 42,
        max_completion_tokens: input.maxCompletionTokens,
        stream: false,
        user: await createSafetyIdentifier(input.userId),
      }),
      signal: controller.signal,
    });
    payload = (await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return null;
    })) as GroqResponse | null;
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new EvaluationFunctionError(
        504,
        "GROQ_TIMEOUT",
        "The AI request took too long. Please retry.",
      );
    }
    throw new EvaluationFunctionError(
      503,
      "GROQ_UNAVAILABLE",
      "AI is temporarily unavailable. Please retry.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detailMessage = providerErrorMessage(payload);

    if (response.status === 429) {
      throw new EvaluationFunctionError(
        429,
        "GROQ_RATE_LIMIT",
        "AI feedback is busy right now. Please retry shortly.",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new EvaluationFunctionError(
        500,
        "EVALUATION_NOT_CONFIGURED",
        `AI feedback API key error: ${detailMessage || "Unauthorized API Key"}`,
        false,
      );
    }
    const invalidRequest = response.status === 400 || response.status === 422;
    throw new EvaluationFunctionError(
      invalidRequest ? 502 : response.status >= 500 ? 503 : 502,
      invalidRequest ? "GROQ_INVALID_REQUEST" : "GROQ_ERROR",
      `AI feedback error (${response.status}): ${detailMessage || "AI feedback could not be generated. Please retry."}`,
      true,
    );
  }

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

function providerErrorMessage(payload: GroqResponse | null) {
  if (!payload || typeof payload !== "object") return "";
  const error = payload.error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return typeof payload.message === "string" ? payload.message : "";
}

type GroqResponse = {
  id?: unknown;
  model?: unknown;
  system_fingerprint?: unknown;
  x_groq?: { id?: unknown };
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  error?: { message?: unknown; type?: unknown; code?: unknown };
  message?: unknown;
};
