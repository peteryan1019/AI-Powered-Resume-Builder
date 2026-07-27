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
job posting. Critique it hard, then return a REVISED version that is strictly
stronger. Both deleting unsupported claims and adding supported material the
draft missed are part of your job.

JOB POSTING URL:
${input2.URL}

VERIFIED USER PROFILE (the only permissible source of facts):
${JSON.stringify(input2.userProfile, null, 2)}

DRAFT RESUME UNDER REVIEW:
${JSON.stringify(input, null, 2)}

OUTPUT SKELETON — the required JSON shape and the fixed section "id" and
"type" values. It is NOT a content target.
${JSON.stringify(selectedTemplate, null, 2)}

Retrieve the posting at the URL EXACTLY ONCE, and retrieve nothing else. Do not
follow links found on that page, do not open other postings, and do not fetch
the same page again for a later pass — read it once, hold it in mind, and work
from that single copy. If it cannot be retrieved, proceed using the draft and
the profile alone.

Then run all five passes below as internal reasoning, not as further lookups.
Do not output your critique — output only the revised resume JSON.

PASS 1 — TRUTH.
Check every claim in the draft against the verified profile. Delete anything
not directly supported. Repair anything overstated so it matches the profile
exactly. Never invent or infer a skill, technology, project, employer, role,
credential, date, metric, achievement, or responsibility, and never reinterpret
one kind of experience as another. Correct any invented number to the profile's
actual figure, or remove the number.

PASS 2 — COVERAGE. This is where drafts lose the most ground.
Enumerate the posting's requirements. For each, check whether the profile
contains supporting evidence. Where the profile supports a requirement but the
draft fails to show it, ADD it. Deletion is not your only permitted edit: a
requirement the user genuinely meets but the draft omitted is a real loss, and
recovering it is the single highest-value change you can make. Likewise restore
any relevant project, role, award, or credential the draft dropped, and split
apart any bullet that has compressed several distinct accomplishments into one
line.

PASS 3 — LANGUAGE.
Align the wording with the posting's own vocabulary wherever the underlying
fact is genuinely the user's. Rephrasing to match is required; claiming to
match is forbidden. If a requirement is simply absent from the profile, it
stays absent.

PASS 4 — STRENGTH.
Rewrite weak bullets. Replace vague or passive phrasing ("worked on", "helped
with", "responsible for") with concrete action verbs; make the specific
technology explicit; end on outcome, scale, or impact wherever the profile
provides one. Cut redundancy across bullets. Reorder sections, entries, and
bullets so the most job-relevant material appears first.

PASS 5 — FILL THE PAGE.
The renderer fits the output to exactly one page. Target 18-24 bullets across
the whole resume, each roughly 15-25 words. If the draft is thinner than that
and the profile holds more supported material, the revision must be fuller.
The revision must not end up shorter or weaker than the draft unless the only
things removed were unsupported claims.

STRUCTURAL RULES.
  - Preserve "jobPostTitle" as the exact job title from the posting; correct it
    if the draft's value is wrong.
  - Use exactly the property names and the section "id" and "type" values from
    the skeleton. Do not add, rename, or drop any property.
  - Every entry and bullet needs a unique, descriptive, kebab-case "id". No id
    may repeat anywhere in the document.
  - Keep header contact parts only where the profile supplies the value, and
    set both "text" and "href" for links.
  - Return JSON only — no markdown, no commentary, no code fences.
    `,

      tools: [{ type: "url_context" }],

      response_format: {type: "text", mime_type: "application/json", schema: resumeSchema,},
    });

    return parseAndValidateResumeOutput(interaction.output_text, resumeSchema);
  });
}
