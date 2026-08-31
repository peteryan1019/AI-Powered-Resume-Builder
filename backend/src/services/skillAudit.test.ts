import { describe, expect, it, vi } from "vitest";
import { loadResumeSchema } from "../lib/schema.js";
import { validateResumeSchemaOutput } from "./resumeSchemaValidation.js";
import { buildReviewSchema, reportSkillAudit } from "./skillAudit.js";

// Smallest document that satisfies assets/templates/schema.json: the three
// required root properties, a header with a name and one contact part, and one
// "bullets" section standing in for TECHNICAL SKILLS.
const resume = {
  jobPostTitle: "Backend Developer",
  header: {
    name: { id: "name", text: "Ada Lovelace" },
    contact: {
      id: "contact",
      parts: [{ id: "email", text: "ada@example.com", href: "mailto:ada@example.com" }],
    },
  },
  sections: [
    {
      id: "technical-skills",
      title: "TECHNICAL SKILLS",
      type: "bullets",
      bullets: [{ id: "languages", label: "Languages:", text: "TypeScript, Python" }],
    },
  ],
};

const audit = [
  {
    skill: "TypeScript",
    section: "technical-skills",
    grounded: true,
    evidence: "WORK_EXPERIENCE 'Backend Developer — Acme': Technologies: TypeScript",
  },
  { skill: "Python", section: "technical-skills", grounded: false, evidence: "" },
];

describe("buildReviewSchema", () => {
  it("accepts a resume carrying skillAudit, which the base schema rejects", async () => {
    const base = await loadResumeSchema();
    const review = buildReviewSchema(base);

    // The base schema sets additionalProperties:false, so the audit can only
    // ride along once the schema is widened. Both halves matter: if the base
    // ever stopped rejecting it, the widening would be pointless.
    expect(() => validateResumeSchemaOutput({ ...resume, skillAudit: audit }, base)).toThrow();
    expect(() => validateResumeSchemaOutput({ ...resume, skillAudit: audit }, review)).not.toThrow();
  });

  it("requires skillAudit, so the reviewer cannot silently skip the audit", async () => {
    const review = buildReviewSchema(await loadResumeSchema());
    expect(() => validateResumeSchemaOutput(resume, review)).toThrow();
    expect(() => validateResumeSchemaOutput({ ...resume, skillAudit: [] }, review)).not.toThrow();
  });

  it("leaves the loaded resume schema untouched", async () => {
    const base = await loadResumeSchema();
    const before = JSON.stringify(base);
    buildReviewSchema(base);
    expect(JSON.stringify(base)).toBe(before);
  });

  it("still rejects a resume that is invalid for reasons unrelated to the audit", async () => {
    const review = buildReviewSchema(await loadResumeSchema());
    const { header, ...headerless } = resume;
    expect(() => validateResumeSchemaOutput({ ...headerless, skillAudit: [] }, review)).toThrow();
  });
});

describe("reportSkillAudit", () => {
  it("names every ungrounded skill and counts the rest", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportSkillAudit(audit, "[t]");

    expect(log.mock.calls.flat().join("\n")).toContain("2 skill(s) reviewed, 1 grounded, 1 ungrounded");
    const warned = warn.mock.calls.flat().join("\n");
    expect(warned).toContain("Python");
    expect(warned).not.toContain("TypeScript");

    log.mockRestore();
    warn.mockRestore();
  });

  it("warns rather than throwing when the model omits the audit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => reportSkillAudit(undefined, "[t]")).not.toThrow();
    expect(warn.mock.calls.flat().join("\n")).toContain("missing or not an array");
    warn.mockRestore();
  });
});
