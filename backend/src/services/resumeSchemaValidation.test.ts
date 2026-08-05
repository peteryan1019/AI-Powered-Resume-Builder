import { describe, expect, it } from "vitest";
import { loadResumeSchema } from "../lib/schema.js";
import {
  ResumeSchemaValidationError,
  parseAndValidateResumeOutput,
  validateResumeSchemaOutput,
} from "./resumeSchemaValidation.js";
import { RetryableAiResponseError } from "./geminiRetry.js";

const schema = await loadResumeSchema();

function validResume() {
  return {
    jobPostTitle: "Backend Engineer",
    header: {
      name: { id: "header-name", text: "Dana Okafor" },
      contact: {
        id: "header-contact-line",
        parts: [{ id: "contact-email", text: "dana@example.com", href: "mailto:dana@example.com" }],
      },
    },
    sections: [
      {
        id: "section-technical-skills",
        title: "TECHNICAL SKILLS",
        type: "bullets",
        bullets: [{ id: "b1", label: "Languages:", text: "Python, Go" }],
      },
    ],
  };
}

describe("resume schema", () => {
  it("loads from assets and requires the top-level keys", () => {
    expect(schema["type"]).toBe("object");
    expect(schema["required"]).toEqual(["jobPostTitle", "header", "sections"]);
  });
});

describe("validateResumeSchemaOutput", () => {
  it("accepts a well-formed resume", () => {
    expect(() => validateResumeSchemaOutput(validResume(), schema)).not.toThrow();
  });

  it("rejects a missing top-level key", () => {
    const doc = validResume() as Record<string, unknown>;
    delete doc["sections"];
    expect(() => validateResumeSchemaOutput(doc, schema)).toThrow(ResumeSchemaValidationError);
  });

  it("rejects an unknown section type", () => {
    const doc = validResume();
    doc.sections[0]!.type = "timeline";
    expect(() => validateResumeSchemaOutput(doc, schema)).toThrow(ResumeSchemaValidationError);
  });

  it("rejects a bullet with no text", () => {
    const doc = validResume();
    delete (doc.sections[0]!.bullets[0] as Record<string, unknown>)["text"];
    expect(() => validateResumeSchemaOutput(doc, schema)).toThrow(ResumeSchemaValidationError);
  });

  it("rejects properties outside the schema", () => {
    const doc = validResume() as Record<string, unknown>;
    doc["notAField"] = true;
    expect(() => validateResumeSchemaOutput(doc, schema)).toThrow(ResumeSchemaValidationError);
  });
});

describe("parseAndValidateResumeOutput", () => {
  it("parses and returns a valid payload", () => {
    const parsed = parseAndValidateResumeOutput(JSON.stringify(validResume()), schema);
    expect(parsed["jobPostTitle"]).toBe("Backend Engineer");
  });

  it("treats an empty response as retryable", () => {
    expect(() => parseAndValidateResumeOutput("", schema)).toThrow(RetryableAiResponseError);
    expect(() => parseAndValidateResumeOutput("   ", schema)).toThrow(RetryableAiResponseError);
  });

  it("treats malformed JSON as retryable", () => {
    expect(() => parseAndValidateResumeOutput("{not json", schema)).toThrow(RetryableAiResponseError);
  });

  it("treats a schema violation as retryable", () => {
    // The pipeline retries these, so they must surface as RetryableAiResponseError
    // rather than escaping as a bare validation error.
    expect(() => parseAndValidateResumeOutput(JSON.stringify({ nope: 1 }), schema)).toThrow(
      RetryableAiResponseError,
    );
  });
});
