/**
 * Skill grounding audit — the diagnostic channel the reviewing AI reports on.
 *
 * The review stage is deliberately told NOT to delete a technical skill it
 * cannot trace back to the verified profile. It keeps the skill and records a
 * verdict instead, so the ungrounded ones can be observed without the resume
 * silently losing them. This module owns the schema for that report, the
 * widened response schema that lets the report travel alongside the resume, and
 * the log that surfaces it.
 *
 * Kept free of the Gemini client and of any API key so the test suite can
 * import it, matching the no-secrets rule in vitest.config.ts.
 */

/**
 * One reviewer verdict on one skill printed by the revised resume's technical
 * skills section.
 */
export interface SkillAuditRow {
  /** The skill exactly as the resume prints it, e.g. "PostgreSQL". */
  skill: string;
  /** The "id" of the resume section the skill appears in. */
  section: string;
  /** True when some part of the verified profile names this skill. */
  grounded: boolean;
  /** The profile entry that names it, quoted; "" when not grounded. */
  evidence: string;
  /** Optional aside, e.g. a spelling difference against the profile. */
  note?: string;
}

/**
 * JSON Schema for the audit array, appended to the resume schema for this call
 * only.
 */
const SKILL_AUDIT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      skill: { type: "string" },
      section: { type: "string" },
      grounded: { type: "boolean" },
      evidence: { type: "string" },
      note: { type: "string" },
    },
    required: ["skill", "section", "grounded", "evidence"],
  },
} as const;

/**
 * The response schema for the review call: the resume schema plus one extra
 * required root property, "skillAudit".
 *
 * assets/templates/schema.json sets "additionalProperties": false on the root
 * object and lists exactly jobPostTitle, header and sections as its properties,
 * so the reviewer cannot return anything alongside the resume unless the schema
 * it answers against is widened first. This widens a copy; the file on disk and
 * the drafting stage that also loads it are untouched.
 */
export function buildReviewSchema(
  resumeSchema: Record<string, unknown>,
): Record<string, unknown> {
  const properties = resumeSchema.properties as
    | Record<string, unknown>
    | undefined;
  const required = Array.isArray(resumeSchema.required)
    ? (resumeSchema.required as string[])
    : [];

  return {
    ...resumeSchema,
    properties: { ...properties, skillAudit: SKILL_AUDIT_SCHEMA },
    required: [...required, "skillAudit"],
  };
}

export function isSkillAuditRow(value: unknown): value is SkillAuditRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.skill === "string" &&
    typeof row.section === "string" &&
    typeof row.grounded === "boolean" &&
    typeof row.evidence === "string"
  );
}

/**
 * Prints the reviewer's skill verdicts.
 *
 * The review deliberately does NOT delete a skill it cannot ground, so this log
 * is the only place the ungrounded ones surface: it shows what the old
 * fail-closed behaviour would have stripped out of the resume, while the
 * resume itself still ships with them.
 */
export function reportSkillAudit(value: unknown, label: string): void {
  if (!Array.isArray(value)) {
    console.warn(`${label} skill audit missing or not an array.`);
    return;
  }

  const rows = value.filter(isSkillAuditRow);
  const ungrounded = rows.filter((row) => !row.grounded);

  console.log(
    `${label} skill audit: ${rows.length} skill(s) reviewed, ` +
      `${rows.length - ungrounded.length} grounded, ${ungrounded.length} ungrounded.`,
  );

  if (ungrounded.length === 0) return;

  console.warn(
    `${label} the reviewer could not ground these skills in the profile. ` +
      `They were KEPT in the resume; the old behaviour would have removed them:`,
  );
  for (const row of ungrounded) {
    const note = row.note ? ` — ${row.note}` : "";
    console.warn(`${label}   - "${row.skill}" (section "${row.section}")${note}`);
  }
}
