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
const GEMINI_API_KEY = process.env.APIKEY_1;

if (!GEMINI_API_KEY) {
  throw new Error("dnwkdnk");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface TailorResumeInput {
  userProfile: ExportedProfile;
  URL: string;
  templateId: string;
}

export async function tailorResume(input: TailorResumeInput): Promise<Prisma.InputJsonObject> {

  const [selectedTemplate, resumeSchema] = await Promise.all([
    loadResumeTemplate(input.templateId),
    loadResumeSchema(),
  ]);

  return retryAiModelRequest("tailor resume", async () => {
    const interaction = await ai.interactions.create({
      model: FASTEST_GEMINI_TEXT_MODEL,

input: `
You are an expert resume writer. Produce the strongest possible one-page
resume for this specific job posting, using ONLY facts that appear in the
verified user profile.

JOB POSTING URL:
${input.URL}

VERIFIED USER PROFILE (the only permissible source of facts):
${JSON.stringify(input.userProfile, null, 2)}

ROOT SKELETON:
${JSON.stringify(selectedTemplate, null, 2)}

The root skeleton defines the required header and root properties. Its
"sections" array is intentionally empty. You must select, create, and order the
appropriate resume sections for this posting.

STEP 1 — READ THE POSTING.
Retrieve the posting at the URL EXACTLY ONCE, and retrieve nothing else. Do not
follow links found on that page and do not open other postings.

From that single copy, identify:
  - the exact job title;
  - every required and preferred qualification;
  - every named technology, tool, language, framework, platform, and method;
  - the core responsibilities and expected outcomes;
  - the posting's own vocabulary.

If the page cannot be fetched, work from the profile alone and set
"jobPostTitle" to "Untitled role".

STEP 2 — MINE THE PROFILE EXHAUSTIVELY.
Evaluate facts from EVERY profile category, including work experience,
volunteer experience, projects, education, skills, certifications, awards,
languages, and any custom information.

Each profile section may contain several accomplishments combined inside one
"description" string. Split those accomplishments apart internally and consider
each one separately.

First select and rank the strongest facts for the posting. Do this before
deciding which resume sections to create. A fact must not be omitted merely
because its source profile category does not receive a standalone section.

Use only verified facts from the profile. Never invent or infer a skill,
technology, project, employer, role, credential, date, metric, achievement, or
responsibility.

STEP 3 — CREATE THE SECTION STRUCTURE.
Organize the selected facts into approximately 3-6 non-empty sections. Create,
omit, rename, and order sections according to their relevance to the posting.

Every section must use one of these schema-supported rendering types:

  - "bullets": technical skills, spoken languages, short credentials, or other
    grouped information;
  - "entries": projects, awards, certifications, or other titled items;
  - "org_entries": employment, volunteer work, teaching, leadership, or other
    organization-based experience;
  - "education": education records.

For an "education" section, use an "entries" array. Create one entry for each
school or distinct education record. Every education entry contains its own
"id", "school", and "bullets".

Create a standalone section when its content is central to the posting or
substantial enough to justify its own heading. Otherwise, place the material
inside the most natural existing section.

Examples:
  - academic awards and distinctions may appear as Education bullets;
  - certifications may appear under Skills or Education, or in a standalone
    Certifications section;
  - spoken languages may appear under Skills or in a standalone Languages
    section;
  - volunteer tutoring may appear in Teaching Experience, Volunteer
    Experience, or an accurately titled broader Experience section.

Never describe volunteer experience as paid employment. Use a section title
that accurately represents the included material. Do not duplicate the same
fact across multiple sections.

STEP 4 — WRITE FOR THIS POSTING.
  - Lead with what the posting asks for.
  - Order sections, entries, and bullets so the most relevant evidence appears
    first.
  - Mirror the posting's vocabulary when the posting and profile describe the
    same verified fact in different words.
  - Never bridge a missing qualification with an invented, implied, or merely
    adjacent claim.
  - Write accomplishment bullets as: strong action verb -> what was done ->
    specific technologies or methods -> verified outcome, scale, or impact.
  - Include a number only if that exact number appears in the profile.
  - Use one accomplishment per bullet.
  - Do not use first person, "responsible for", unsupported soft-skill padding,
    or objective statements.
  - Remove repetition across sections and bullets.

For a technical-skills section, use "label" for the category, such as
"Languages:", and "text" for the comma-separated values. Put technologies named
in the posting first, but only when the profile supports them.

Use "Spoken Languages:" for human languages so they are not confused with
programming languages.

STEP 5 — FILL THE PAGE.
Target approximately 18-24 bullets or equivalent content items across the
whole resume, with most accomplishment bullets around 15-25 words.

This is a relevance target, not permission to pad the resume. If the profile
does not contain enough supported material, return less content. Prefer a
smaller number of strong sections over weak one-item sections. Relevant
optional material should replace weaker material rather than simply making the
resume longer.

STRUCTURAL RULES.
  - Preserve the root and header property names from the skeleton.
  - Create only non-empty sections.
  - Every section must contain:
      - a unique descriptive kebab-case "id";
      - an appropriate uppercase "title";
      - one supported "type";
      - the properties required by that type.
  - Every entry and bullet must have a unique descriptive kebab-case "id".
  - No ID may repeat anywhere in the document.
  - For Education, use "entries"; do not place "school" or "bullets" directly
    on the Education section.
  - Fill the header name, phone, and email from the profile.
  - Include LinkedIn, GitHub, and portfolio contact parts only when the profile
    supplies their URLs.
  - Set both "text" and "href" for linked contact parts.
  - Use a "mailto:" href for email.
  - Set "jobPostTitle" to the exact posting title.
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

      tools: [
        {
          type: "url_context",
        },
      ],

      response_format: {type: "text", mime_type: "application/json", schema: resumeSchema,
      },
    });

    return parseAndValidateResumeOutput(interaction.output_text, resumeSchema);
  });
}
