import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import type { ExportedProfile } from "../lib/profileExport.js";
import {
  PROFILE_AGENT_MODEL,
  RetryableAiResponseError,
  retryAiModelRequest,
} from "./geminiRetry.js";

// Extraction, not judgement, so this runs on the fast free-tier key rather than
// the coach's paid one.
const apiKey = process.env.APIKEY_2;
if (!apiKey)
  throw new Error("APIKEY_2 is required for the profile agent.");
const ai = new GoogleGenAI({ apiKey });

/** The eight section types a profile entry can belong to. */
export const PROFILE_SECTION_TYPES = [
  "WORK_EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "PROJECTS",
  "CERTIFICATIONS",
  "AWARDS",
  "LANGUAGES",
  "VOLUNTEER",
] as const;

export type ProfileSectionType = (typeof PROFILE_SECTION_TYPES)[number];

/**
 * The fields each section type actually accepts. This mirrors the `fields` map
 * in the profile's own instance-form component, which is the source of truth for
 * what a form of each type renders; anything outside these lists would be
 * dropped on the floor by that form, so the model's output is filtered to them
 * rather than trusted. Keep the two in step if a form gains a field.
 */
export const SECTION_FIELDS: Record<ProfileSectionType, string[]> = {
  WORK_EXPERIENCE: ["company", "title", "location", "startDate", "endDate", "current", "description"],
  EDUCATION: ["school", "degree", "field", "gpa", "startDate", "endDate", "description"],
  SKILLS: ["category", "skillsRaw"],
  PROJECTS: ["name", "url", "startDate", "endDate", "current", "description"],
  CERTIFICATIONS: ["name", "issuer", "date", "url"],
  AWARDS: ["title", "issuer", "date", "description"],
  LANGUAGES: ["language", "proficiency"],
  VOLUNTEER: ["organization", "role", "startDate", "endDate", "current", "description"],
};

/**
 * A proposed change to the profile, of one of two kinds.
 *
 * `create` is a new entry the profile does not have. `update` is a fact the user
 * stated about an entry it DOES have, whose text does not yet say it -- the case
 * where the coach doubts a claim and the user answers that it is true but was
 * never written down.
 *
 * `fields` is flat and wholly optional, mirroring the union of every field the
 * profile's own instance form accepts, so the UI can hand it to that form as
 * pre-filled data with no per-type translation.
 */
export interface ProfileChange {
  mode: "create" | "update";
  sectionType: ProfileSectionType;
  /** For an update, the existing entry's sourceId from the profile export. */
  sourceId?: string;
  /** A short human phrase for the prompt, e.g. "a project called Ledger API". */
  label: string;
  /** The user's own words that prompted this, quoted back so they can judge it. */
  quote: string;
  /**
   * For an update, the exact words from the note that identify the entry being
   * changed. Verified to appear in what the user wrote, so a proposal cannot
   * claim a target the user never referred to.
   */
  identifiedBy?: string;
  /**
   * For a create, the new entry's fields. For an update, only what changes:
   * `description` carries just the NEW sentence to add, never a rewrite, so
   * nothing already written can be lost. Other fields are replacements.
   */
  fields: Record<string, string | boolean>;
  /** Fields the user did not state, which the form should ask for. */
  missing: string[];
}

/** Every field name any section type accepts, for the key enum below. */
const ALL_FIELD_NAMES = [
  ...new Set(Object.values(SECTION_FIELDS).flat()),
];

const fieldSchema = {
  type: "array",
  maxItems: 8,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      key: { type: "string", enum: ALL_FIELD_NAMES },
      value: { type: "string" },
    },
    required: ["key", "value"],
  },
} as const;

const agentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    changes: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["create", "update"] },
          sectionType: { type: "string", enum: PROFILE_SECTION_TYPES },
          sourceId: { type: "string" },
          identifiedBy: { type: "string" },
          label: { type: "string" },
          quote: { type: "string" },
          fields: fieldSchema,
          missing: { type: "array", items: { type: "string" } },
        },
        required: [
          "mode",
          "sectionType",
          "sourceId",
          "identifiedBy",
          "label",
          "quote",
          "fields",
          "missing",
        ],
      },
    },
  },
  required: ["changes"],
} as const;

/**
 * Whether an update proposal is anchored in something the user actually wrote.
 *
 * The model once matched "As part of school work, I coded a Linux shell script"
 * to an existing Android project, because both descriptions opened "as part of
 * coursework" -- a shared turn of phrase, not the same thing. Requiring it to
 * quote the words that identify its target, and checking those words really
 * appear in the note, turns an unfalsifiable guess into a claim that can be
 * refused. A loose reference still passes: "robot soccer" is enough to point at
 * "Autonomous Robot Soccer Player".
 */
export function updateIsAnchored(
  identifiedBy: string | undefined,
  notes: Array<{ about: string; text: string }>,
): boolean {
  const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const needle = normalise(identifiedBy ?? "");
  if (needle.length < 3) return false;
  // The recommendation counts as part of what the user said. Replies are terse
  // -- "i just haven't added that to my profile yet" names nothing at all, and
  // the entry it means is named in the recommendation it answers. Searching the
  // note alone refused every short reply, which is most of them.
  const said = notes
    .map((note) => `${note.about} ${note.text}`)
    .join(" ");
  return normalise(said).includes(needle);
}

export interface ProfileAgentInput {
  /** What the user wrote, with the recommendation each note answers. */
  notes: Array<{ about: string; text: string }>;
  profile: ExportedProfile;
}

/**
 * Reads what the user typed while reviewing and notices when they have
 * described something their profile does not contain.
 *
 * It only ever PROPOSES. Nothing here writes to the profile, because the coach
 * prompt treats the profile as the only source of candidate facts and the
 * truthfulness score depends on every entry in it having been confirmed by the
 * user. Extract, then ask.
 */
export async function proposeProfileChanges(
  input: ProfileAgentInput,
): Promise<ProfileChange[]> {
  const written = input.notes
    .filter((note) => note.text.trim())
    .map((note) => `About "${note.about}", the user wrote:\n${note.text.trim()}`)
    .join("\n\n");
  if (!written) return [];

  return retryAiModelRequest("profile agent", async () => {
    const interaction = await ai.interactions.create({
      model: PROFILE_AGENT_MODEL,
      input: `
You read what a user typed while reviewing coaching feedback on their resume,
and you notice when they have described something their profile does not list.

WHAT THE USER WROTE:
${written}

EACH SECTION TYPE ACCEPTS ONLY THESE FIELDS. Use no others:
${PROFILE_SECTION_TYPES.map((type) => `- ${type}: ${SECTION_FIELDS[type].join(", ")}`).join("\n")}

What each field means:
- name / title: what the thing is called, and nothing else.
- company, school, organization, issuer: the name of an organisation.
- role, degree, field, category, language, proficiency: a short phrase.
- url: a web address, starting with http. Omit it unless the user gave one.
- date, startDate, endDate: YYYY-MM. Omit rather than guessing a month.
- current: true only if the user said it is ongoing.
- description: prose about what the thing is and what the user did. All prose
  goes here, for the types that have it, and nowhere else.
- skillsRaw: a comma-separated list of skills.

Every value is the literal fact and nothing more. Never write an explanation, a
note about these instructions, or an apology inside a field value.

Return "fields" as a list of {key, value} pairs, one per fact you actually have.
Emit no pair for a fact the user did not give.

Fill EVERY field the user did state. Dropping a fact they gave you is as wrong as
inventing one they did not. Leave out only what they genuinely did not say, and
name those in "missing".

For example, if the user wrote:
  "I got my AWS Solutions Architect Associate cert in March 2025, issued by Amazon."
the correct addition is CERTIFICATIONS with
  name "AWS Solutions Architect Associate", issuer "Amazon", date "2025-03",
  and missing ["url"] -- because they gave the name, the issuer and the date, and
  only the web address is absent.

And if they wrote:
  "I built a tool called PromptForge that generates prompt test suites in Python."
the correct addition is PROJECTS with
  name "PromptForge",
  description "Generates prompt test suites, built in Python.",
  and missing ["startDate", "endDate"].

THEIR PROFILE ALREADY CONTAINS (with the text each entry currently carries --
read it, because whether a fact is already written there is the whole question):
${input.profile.sections
  .map(
    (section) =>
      `- sourceId ${section.sourceId} | ${section.type} | ${section.title} (${
        section.date || "no date"
      })\n    ${(section.description || "(no description yet)").slice(0, 400)}`,
  )
  .join("\n")}

There are two kinds of change you may propose.

CREATE -- the user described something the profile does not list at all. Set mode
to "create", leave sourceId as an empty string, and fill the new entry's fields.

UPDATE -- the user stated a fact about an entry that IS listed above, and that
entry's current text does not already say it. This is the common case when the
coach doubted a claim and the user answered that it is true but was never written
into their profile. Set mode to "update", put that entry's sourceId in sourceId,
and put ONLY what changes in fields. For "description" give just the new sentence
to add, in the user's own terms -- never a rewrite of the existing text, because
the app appends what you give and a rewrite would lose what is already there.

An update requires the user to be talking about THAT SAME THING. Put the exact
words from their note that identify it -- its name, or an unambiguous reference
such as "that internship" -- in "identifiedBy", copied character for character
from what they wrote. If you cannot point at such words, it is not an update.

Describing a second, different thing is a CREATE even when it sits in the same
domain, the same year, or the same sentence pattern as something already listed.
Two entries sharing a turn of phrase are not the same entry. For example, if the
profile already holds a project described as "As part of coursework, used Android
Studio and Java to build an Android App", and the user writes "As part of school
work, I also coded up a Linux shell script that filters and organises CSV files",
that is a CREATE of a new project. The shared opening is a coincidence of
phrasing; a shell script is not a fact about an Android app, and the word "also"
says outright that it is a further thing.

Propose nothing when the user is merely expressing a preference, disagreeing, or
asking a question. Ordering, wording and emphasis are not profile facts. Never
propose something the user only asked about, was recommended, or might do.

Fill only the fields the user actually stated. Leave every other field out
entirely rather than guessing, and list the names of the fields a person would
normally expect but the user did not give in "missing" -- dates especially.
Use YYYY-MM for dates. Put the user's own words in "quote". Make "label" a short
phrase naming the thing: for a create, "a project called Ledger API"; for an
update, the entry it changes, such as "your Data Engineer role at Acme".

Weigh each note on its own, then return one entry in "changes" for every
distinct thing you find. Two notes about two different profile entries are two
changes, not one; a single note naming two things is likewise two. Do not stop at
the first thing you notice.

Return an empty changes array when nothing qualifies. Silence is the right answer
for a note that only disagrees, asks, or states a preference -- but a note saying
a claim is true and merely absent from the profile is never silence: it is an
update to whatever entry the recommendation is about.
`,
      tools: [],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: agentSchema,
      },
    });

    const raw = (interaction as { output_text?: string }).output_text;
    if (!raw?.trim())
      throw new RetryableAiResponseError("The profile agent returned nothing.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new RetryableAiResponseError(
        "The profile agent returned invalid JSON.",
      );
    }
    const changes = (parsed as { changes?: unknown }).changes;
    if (!Array.isArray(changes))
      throw new RetryableAiResponseError(
        "The profile agent returned no changes array.",
      );

    // An update may only name an entry that actually exists, and must agree with
    // that entry's own section type -- otherwise the form would open on the
    // wrong shape and write the wrong fields.
    const bySourceId = new Map(
      input.profile.sections.map((section) => [section.sourceId, section.type]),
    );


    return changes
      .filter(
        (item): item is ProfileChange =>
          typeof item === "object" &&
          item !== null &&
          PROFILE_SECTION_TYPES.includes(
            (item as ProfileChange).sectionType as ProfileSectionType,
          ),
      )
      .filter((item) => {
        if (item.mode === "create") return true;
        if (item.mode !== "update") return false;
        const sourceId = (item.sourceId ?? "").trim();
        if (!sourceId || bySourceId.get(sourceId) !== item.sectionType) {
          console.error(
            `[profile-agent] dropped an update: sourceId ${JSON.stringify(
              sourceId,
            )} is not a ${item.sectionType} in this profile`,
          );
          return false;
        }
        // An update has to be anchored in something the user actually wrote. The
        // model once matched "As part of school work, I coded a Linux shell
        // script" to an existing Android project because both began "as part of
        // coursework" -- a shared turn of phrase, not the same thing. Requiring
        // it to quote the identifying words, and checking those words are really
        // in the note, turns that guess into something falsifiable.
        if (!updateIsAnchored(item.identifiedBy, input.notes)) {
          console.error(
            `[profile-agent] dropped an update to ${JSON.stringify(
              item.label,
            )}: nothing in what the user wrote matches identifiedBy ${JSON.stringify(
              item.identifiedBy,
            )}`,
          );
          return false;
        }
        return true;
      })
      .map((item) => {
        const allowed = SECTION_FIELDS[item.sectionType];
        const pairs = (item.fields as unknown as Array<{ key: string; value: string }>) ?? [];
        const fields: Record<string, string | boolean> = {};
        for (const { key, value } of pairs) {
          if (!allowed.includes(key) || typeof value !== "string" || !value.trim())
            continue;
          if (key === "current") {
            fields[key] = value.trim().toLowerCase() === "true";
            continue;
          }
          // A url containing spaces is the model reaching for somewhere to put
          // prose; an overlong value in a short field is the same mistake.
          if (key === "url" && !/^https?:\/\/\S+$/i.test(value.trim())) continue;
          // The form and the renderer expect YYYY-MM, or a bare year at worst.
          if (
            (key === "date" || key === "startDate" || key === "endDate") &&
            !/^\d{4}(-\d{2})?$/.test(value.trim())
          )
            continue;
          if (key !== "description" && value.trim().length > 200) continue;
          fields[key] = value.trim();
        }
        // Built key by key rather than spread, so a create never carries the
        // empty sourceId the schema makes the model send.
        const base: ProfileChange = {
          mode: item.mode,
          sectionType: item.sectionType,
          label: String(item.label ?? "").trim().slice(0, 200),
          quote: String(item.quote ?? "").trim().slice(0, 500),
          fields,
          // A field the user did in fact fill is not missing, whatever the model
          // said; and a field the form does not have cannot be asked for. An
          // update asks for nothing: the entry already exists.
          missing:
            item.mode === "update"
              ? []
              : (item.missing ?? []).filter(
                  (key) => allowed.includes(key) && !(key in fields),
                ),
        };
        return item.mode === "update"
          ? {
              ...base,
              sourceId: (item.sourceId ?? "").trim(),
              identifiedBy: (item.identifiedBy ?? "").trim().slice(0, 200),
            }
          : base;
      })
      .filter((item) => Object.keys(item.fields).length > 0);
  });
}
