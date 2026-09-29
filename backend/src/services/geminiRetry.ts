export const FASTEST_GEMINI_TEXT_MODEL = "gemini-3.1-flash-lite";

// The coach grades the draft, which is the one step worth a reasoning model.
// Gemini 3.1 Pro is only published under the -preview id; plain
// "gemini-3.1-pro" returns 404 from the API.
export const COACH_GEMINI_MODEL = "gemini-3.1-pro-preview";

// The writer drafts and revises the resume (tailorResume in test-gemini.ts,
// reviseResume in check-gemini.ts). It runs on Pro for the same reason the
// coach does, and its model id must include the -preview suffix.
export const WRITER_GEMINI_MODEL = "gemini-3.1-pro-preview";

// The profile agent reads what the user typed and decides whether it names
// something their profile is missing. Extraction, not judgement, so the fast
// cheap model is right for it. (It first appeared to need a stronger model,
// dropping stated facts and writing prose into `url`. That was the response
// SCHEMA, not the model: asked to fill one object of twenty-odd optional
// properties, it reached for something to put in each. Asked for a list of
// key/value pairs, flash-lite is exact -- and three times faster than flash.)
// Overridable so a bad extraction can be re-run against a stronger model
// without a deploy.
export const PROFILE_AGENT_MODEL =
  process.env.PROFILE_AGENT_MODEL ?? "gemini-3.1-flash-lite";

const MAX_AI_MODEL_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const JITTER_MS = 150;

type AiRetryFailureReason = "server_error" | "invalid_output";

export class AiModelUnavailableError extends Error {
  readonly reason: AiRetryFailureReason;

  constructor(reason: AiRetryFailureReason, options?: { cause?: unknown }) {
    super(
      reason === "server_error"
        ? "The AI model is temporarily unavailable after repeated server errors."
        : "The AI model returned invalid resume output after repeated attempts.",
      options,
    );
    this.name = "AiModelUnavailableError";
    this.reason = reason;
  }
}

export class RetryableAiResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RetryableAiResponseError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function numericStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d{3}$/.test(value)) {
    return Number(value);
  }

  return null;
}

function extractHttpStatus(error: unknown): number | null {
  const root = asRecord(error);
  if (!root) return null;

  for (const key of ["status", "statusCode", "code"]) {
    const status = numericStatus(root[key]);
    if (status) return status;
  }

  for (const key of ["response", "error"]) {
    const nested = asRecord(root[key]);
    if (!nested) continue;

    for (const nestedKey of ["status", "statusCode", "code"]) {
      const status = numericStatus(nested[nestedKey]);
      if (status) return status;
    }
  }

  return null;
}

function isAiServerError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  return status !== null && status >= 500 && status < 600;
}

function getRetryReason(error: unknown): AiRetryFailureReason | null {
  if (isAiServerError(error)) {
    return "server_error";
  }

  if (error instanceof RetryableAiResponseError) {
    return "invalid_output";
  }

  return null;
}

function backoffDelayMs(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return exponentialDelay + Math.floor(Math.random() * JITTER_MS);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryAiModelRequest<T>(
  label: string,
  request: () => Promise<T>,
): Promise<T> {
  let lastRetryableError: unknown;
  let lastRetryReason: AiRetryFailureReason = "server_error";

  for (let attempt = 1; attempt <= MAX_AI_MODEL_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error: unknown) {
      const retryReason = getRetryReason(error);

      if (!retryReason) {
        throw error;
      }

      lastRetryableError = error;
      lastRetryReason = retryReason;

      if (attempt === MAX_AI_MODEL_ATTEMPTS) {
        break;
      }

      const delayMs = backoffDelayMs(attempt);
      const reasonText =
        retryReason === "server_error"
          ? "a server error"
          : "invalid resume output";
      console.warn(
        `[Gemini] ${label} failed with ${reasonText}. Retrying attempt ${
          attempt + 1
        }/${MAX_AI_MODEL_ATTEMPTS} in ${delayMs}ms.`,
      );
      await wait(delayMs);
    }
  }

  throw new AiModelUnavailableError(lastRetryReason, {
    cause: lastRetryableError,
  });
}
