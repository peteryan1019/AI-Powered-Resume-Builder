import type { ExportedProfile } from "../lib/profileExport.js";
import { loadResumeTemplate } from "../lib/templateRegistry.js";
import { loadResumeSchema } from "../lib/schema.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  FASTEST_GEMINI_TEXT_MODEL,
  retryAiModelRequest,
} from "./geminiRetry.js";
import { parseAndValidateResumeOutput } from "./resumeSchemaValidation.js";
import "dotenv/config";

import { GoogleGenAI } from "@google/genai";
const GEMINI_API_KEY = process.env.APIKEY_2;

if (!GEMINI_API_KEY) {
  throw new Error("Request failed");
}

export interface TailorResumeInput {
  userProfile: ExportedProfile;
  URL: string;
  templateId: string;
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function finalResume(input: Prisma.InputJsonObject, input2: TailorResumeInput): Promise<Prisma.InputJsonObject> {
  const [selectedTemplate, resumeSchema] = await Promise.all([
    loadResumeTemplate(input2.templateId),
    loadResumeSchema(),
  ]);

  return retryAiModelRequest("finalize resume", async () => {
    const interaction = await ai.interactions.create({
      model: FASTEST_GEMINI_TEXT_MODEL,

input: `
You are a senior hiring manager reviewing a DRAFT resume written for a specific
job posting. Return a REVISED version that is strictly stronger, fully truthful,
and better targeted.

Deleting unsupported or weak material, adding supported material the draft
missed, and reorganizing the section structure are all part of your job.

JOB POSTING URL:
${input2.URL}

VERIFIED USER PROFILE (the only permissible source of facts):
${JSON.stringify(input2.userProfile, null, 2)}

DRAFT RESUME UNDER REVIEW:
${JSON.stringify(input, null, 2)}

ROOT SKELETON:
${JSON.stringify(selectedTemplate, null, 2)}

The root skeleton defines the required header and root properties. Its
"sections" array is intentionally empty. The draft's current sections are only
a starting point, not a required section list.

Retrieve the posting at the URL EXACTLY ONCE, and retrieve nothing else. Do not
follow links found on that page, open other postings, or fetch the page again.

If the posting cannot be retrieved, proceed using the draft and verified
profile alone.

Run all five passes below as internal reasoning. Do not output the critique.
Output only the revised resume JSON.

PASS 1 — TRUTH.
Check every claim in the draft against the verified profile.

Delete anything not directly supported. Repair overstated wording so it matches
the profile exactly. Never invent or infer a skill, technology, project,
employer, role, credential, date, metric, achievement, or responsibility.

Correct invented numbers to the profile's exact figures or remove them.

The displayed resume section does not need to match the fact's original profile
category, but the presentation must remain truthful. For example, volunteer
work may appear under an accurately titled Experience section, but it must not
be represented as paid or professional employment.

PASS 2 — COVERAGE.
Enumerate the posting's requirements. For every requirement, check whether the
verified profile contains supporting evidence.

Where the profile supports a requirement but the draft fails to show it, add
the strongest supporting fact. Restore any relevant experience, volunteer
work, project, education, skill, certification, award, language, or custom
detail that the draft wrongly omitted.

Evaluate EVERY profile category. Do not focus only on paid work, projects, and
technical skills.

Split any bullet that incorrectly compresses multiple distinct accomplishments.
Do not duplicate the same fact in multiple locations.

PASS 3 — SECTION DESIGN.
Reconsider the resume structure after selecting the strongest facts. You may
create, remove, rename, and reorder sections.

Every section must use one of these schema-supported types:

  - "bullets": skills, languages, short credentials, or grouped information;
  - "entries": projects, awards, certifications, or other titled items;
  - "org_entries": employment, volunteer work, teaching, leadership, or other
    organization-based experience;
  - "education": education records.

For an "education" section, use an "entries" array. Create one entry for each
school or distinct education record. Every education entry contains its own
"id", "school", and "bullets".

Create a standalone section when its content is central to the posting or
substantial enough to justify its own heading. Otherwise, integrate it into the
most natural existing section.

Examples:
  - academic distinctions may remain under Education instead of becoming a
    separate Awards section;
  - certifications may appear under Skills or Education;
  - spoken languages may appear under Skills when relevant;
  - tutoring and education outreach may justify a dedicated Teaching
    Experience section for a tutoring role.

Avoid weak one-item sections unless the item represents a central qualification
for the job. Use accurate section titles and return only non-empty sections.

PASS 4 — LANGUAGE AND STRENGTH.
Align wording with the posting's vocabulary wherever the underlying fact is
genuinely supported. Rephrasing a verified fact is required when it improves
the match; claiming an unsupported match is forbidden.

Rewrite vague or passive bullets using concrete action verbs. State what was
done, the relevant technology or method, and a verified outcome, scale, or
impact where available.

Remove filler and redundancy. Reorder sections, entries, and bullets so the
most job-relevant evidence appears first.

Use "Spoken Languages:" for human languages so they are not confused with
programming languages.

PASS 5 — ONE-PAGE CONTENT SELECTION.
Target approximately 18-24 bullets or equivalent content items across
approximately 3-6 sections. Most accomplishment bullets should be around 15-25
words.

These are relevance targets, not mandatory quotas. Do not pad the resume or
retain weaker material merely to keep the revision as long as the draft.

The revision may be shorter when removing unsupported, redundant, or
lower-relevance material. When the profile contains stronger omitted material,
replace weaker content with it.

STRUCTURAL RULES.
  - Preserve the required root and header property names.
  - Preserve "jobPostTitle" as the exact job title from the posting and correct
    it if the draft is wrong.
  - You may add, remove, rename, and reorder sections.
  - Every section must have a unique descriptive kebab-case "id", an accurate
    uppercase "title", and one schema-supported "type".
  - Each section must contain exactly the properties required by its type.
  - For Education, use "entries"; never place "school" or "bullets" directly
    on the Education section.
  - Preserve valid existing IDs for unchanged sections, entries, and bullets
    when practical.
  - Give every newly created section, entry, and bullet a unique descriptive
    kebab-case ID.
  - No ID may repeat anywhere in the document.
  - Keep contact parts only when the verified profile supplies their values.
  - Set both "text" and "href" for linked contact parts.
  - Use a "mailto:" href for email.
  - Return JSON only: no markdown, commentary, critique, or code fences.
  - The exact section shapes are:
    - "bullets":
      { "id", "title", "type": "bullets", "bullets": [...] }

    - "entries":
      { "id", "title", "type": "entries", "entries": [...] }
      Each entry contains:
      { "id", "heading", "meta", "date", "bullets" }

    - "org_entries":
      { "id", "title", "type": "org_entries", "entries": [...] }
      Each entry contains:
      { "id", "org", "role", "location", "date", "bullets" }

    - "education":
      { "id", "title", "type": "education", "entries": [...] }
      Each education entry contains:
      { "id", "school": { "id", "text" }, "bullets" }

    Every bullet contains "id" and "text", and may also contain "label" and "url".
    The JSON response schema is authoritative if any structural ambiguity remains.
`,

      tools: [{ type: "url_context" }],

      response_format: {type: "text", mime_type: "application/json", schema: resumeSchema,},
    });

    return parseAndValidateResumeOutput(interaction.output_text, resumeSchema);
  });
}
