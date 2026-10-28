/** No prompts, credentials, transcripts, or audio enter the usage payload. */
export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = true,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
export type UsageContext = {
  admin: unknown;
  userId: string;
  operationId: string;
  source: string;
};
export function usageContext(
  admin: unknown,
  userId: string,
  operationId: string,
  source: string,
): UsageContext {
  return { admin, userId, operationId, source };
}
async function record(context: UsageContext, data: Record<string, unknown>) {
  const result = await (context.admin as RpcClient).rpc("record_ai_provider", {
    p_source: context.source,
    p_operation_id: context.operationId,
    p_user_id: context.userId,
    p_data: data,
  });
  if (result.error || typeof result.data !== "string") {
    throw new ProviderError(
      503,
      "AI_ACCOUNTING_UNAVAILABLE",
      "AI processing could not be safely recorded. Please try again later.",
    );
  }
  return result.data;
}
export function retryAfterSeconds(
  value: string | null,
  now = Date.now(),
): number {
  if (!value) return 5;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric)
    ? numeric
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 5;
}
export function providerHttpError(
  status: number,
  retryAfter: string | null,
  code?: unknown,
): ProviderError {
  if (
    [
      "insufficient_quota",
      "billing_hard_limit_reached",
      "spend_limit_exceeded",
      "budget_exceeded",
    ].includes(String(code))
  ) status = 402;
  if (
    ["model_decommissioned", "model_not_found", "model_not_available"].includes(
      String(code),
    )
  ) status = 404;
  if (status === 429) {
    const delay = retryAfterSeconds(retryAfter);
    return new ProviderError(
      429,
      "GROQ_RATE_LIMIT",
      `AI capacity is busy. Try again in ${delay} seconds.`,
      true,
      delay,
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderError(
      503,
      "EVALUATION_NOT_CONFIGURED",
      "AI access is unavailable. Please contact support.",
      false,
    );
  }
  if (status === 402) {
    return new ProviderError(
      503,
      "GROQ_BUDGET_LIMIT",
      "AI service budget is temporarily unavailable. Please try again later.",
      false,
    );
  }
  if (status === 404) {
    return new ProviderError(
      503,
      "GROQ_MODEL_UNAVAILABLE",
      "The configured AI model is unavailable. Please contact support.",
      false,
    );
  }
  if (status === 413) {
    return new ProviderError(
      413,
      "audio_too_large",
      "The recording is too large. Please record a shorter answer.",
      false,
    );
  }
  if ([400, 415, 422].includes(status)) {
    return new ProviderError(
      422,
      "GROQ_INVALID_REQUEST",
      "The AI service could not process this request. Please check the input or contact support.",
      false,
    );
  }
  return new ProviderError(
    503,
    "GROQ_ERROR",
    "The AI service is temporarily unavailable. Your saved progress is safe.",
  );
}
export function aiClaimError(
  error: { message: string; details?: string },
): Response | null {
  if (!/AI_CAPACITY_|AI_USER_OPERATION_ACTIVE/.test(error.message)) return null;
  const delay = /^\d+$/.test(error.details ?? "")
    ? Math.max(1, Number(error.details))
    : 60;
  return Response.json({
    code: "ai_capacity_busy",
    message:
      `AI processing is busy or another request is still finishing. Retry in ${delay} seconds. Your interview allowance is unchanged.`,
    retryable: true,
  }, { status: 429, headers: { "Retry-After": String(delay) } });
}
export function validateTokenBudget(
  inputUpperBound: number,
  outputLimit: number,
) {
  if (
    !Number.isInteger(inputUpperBound) || inputUpperBound < 0 ||
    inputUpperBound > 120000 ||
    !Number.isInteger(outputLimit) || outputLimit < 1 || outputLimit > 3200
  ) {
    throw new ProviderError(
      422,
      "AI_TOKEN_BUDGET_EXCEEDED",
      "This AI request is too large to process safely. Shorten the input or contact support.",
      false,
    );
  }
}
function measured(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? value as number
    : null;
}

export async function fetchGroqJson(input: {
  url: string;
  apiKey: string;
  model: string;
  body: BodyInit;
  usage: UsageContext;
  inputUpperBound?: number;
  outputLimit?: number;
  audioSeconds?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<{ payload: Record<string, any> | null; response: Response }> {
  if (input.audioSeconds !== undefined) {
    if (
      !Number.isFinite(input.audioSeconds) || input.audioSeconds <= 0 ||
      input.audioSeconds > 120
    ) {
      throw new ProviderError(
        422,
        "audio_duration_invalid",
        "Record between 1 and 120 seconds.",
        false,
      );
    }
  } else validateTokenBudget(input.inputUpperBound!, input.outputLimit!);
  const usageId = await record(input.usage, {
    provider_status: "sent",
    model: input.model,
    input_token_upper_bound: input.inputUpperBound,
    output_token_limit: input.outputLimit,
    audio_seconds: input.audioSeconds,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 75000);
  let response: Response;
  let payload: Record<string, any> | null;
  try {
    response = await (input.fetcher ?? fetch)(input.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "X-Client-Request-Id": input.usage.operationId,
        ...(typeof input.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: input.body,
      signal: controller.signal,
    });
    // Deadline includes body consumption, not just receipt of HTTP headers.
    payload = await response.json().catch((error) => {
      if (controller.signal.aborted || !(error instanceof SyntaxError)) throw error;
      return null;
    });
  } catch {
    await record(input.usage, {
      usage_id: usageId,
      provider_status: "unknown",
      error_code: controller.signal.aborted
        ? "GROQ_TIMEOUT"
        : "GROQ_UNAVAILABLE",
    });
    throw new ProviderError(
      controller.signal.aborted ? 504 : 503,
      controller.signal.aborted ? "GROQ_TIMEOUT" : "GROQ_UNAVAILABLE",
      "The AI request was interrupted. Your saved progress is safe. Wait before retrying.",
    );
  } finally {
    clearTimeout(timer);
  }
  const failure = response.ok ? null : providerHttpError(
    response.status,
    response.headers.get("retry-after"),
    payload?.error?.code,
  );
  await record(input.usage, {
    usage_id: usageId,
    provider_status: response.ok
      ? "succeeded"
      : response.status >= 500
      ? "unknown"
      : "rejected",
    model: typeof payload?.model === "string" ? payload.model : input.model,
    input_tokens: measured(payload?.usage?.prompt_tokens),
    output_tokens: measured(payload?.usage?.completion_tokens),
    provider_request_id: response.headers.get("x-request-id"),
    http_status: response.status,
    error_code: failure?.code,
    retry_after_seconds: failure?.retryAfterSeconds,
  });
  if (failure) throw failure;
  return { payload, response };
}
