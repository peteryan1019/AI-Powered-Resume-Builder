import { Ajv, type ErrorObject } from "ajv";
import type { Prisma } from "../../generated/prisma/client.js";
import { RetryableAiResponseError } from "./geminiRetry.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

export class ResumeSchemaValidationError extends Error {
  constructor(details: string) {
    super(`Gemini returned JSON that does not match the resume schema: ${details}`);
    this.name = "ResumeSchemaValidationError";
  }
}

function formatValidationErrors(errors: ErrorObject[]): string {
  return errors
    .slice(0, 5)
    .map((error) => {
      const path = error.instancePath || "/";
      return `${path} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

export function validateResumeSchemaOutput(
  value: unknown,
  schema: Record<string, unknown>,
): asserts value is Prisma.InputJsonObject {
  const validate = ajv.compile(schema);

  if (validate(value)) {
    return;
  }

  throw new ResumeSchemaValidationError(
    validate.errors?.length
      ? formatValidationErrors(validate.errors)
      : "unknown validation error",
  );
}

export function parseAndValidateResumeOutput(
  outputText: unknown,
  schema: Record<string, unknown>,
): Prisma.InputJsonObject {
  if (typeof outputText !== "string" || outputText.trim() === "") {
    throw new RetryableAiResponseError("Gemini returned an empty response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch (error: unknown) {
    throw new RetryableAiResponseError("Gemini returned invalid JSON.", {
      cause: error,
    });
  }

  try {
    validateResumeSchemaOutput(parsed, schema);
  } catch (error: unknown) {
    if (error instanceof ResumeSchemaValidationError) {
      throw new RetryableAiResponseError(error.message, { cause: error });
    }

    throw error;
  }

  return parsed;
}
