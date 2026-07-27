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
You are an expert technical resume writer. Produce the strongest possible
one-page resume for this specific job posting, using ONLY facts that appear in
the verified user profile.

JOB POSTING URL:
${input.URL}

VERIFIED USER PROFILE (the only permissible source of facts):
${JSON.stringify(input.userProfile, null, 2)}

OUTPUT SKELETON — this shows the required JSON shape and the fixed section
"id" and "type" values. It is NOT a content target: every empty array in it
must come back filled.
${JSON.stringify(selectedTemplate, null, 2)}

STEP 1 — READ THE POSTING.
Retrieve the posting at the URL EXACTLY ONCE, and retrieve nothing else. Do not
follow links found on that page and do not open other postings. From that
single copy extract, before writing anything:
  - the exact job title;
  - every required and preferred qualification;
  - every named technology, tool, language, framework, platform, and method;
  - the core responsibilities and the outcomes the role is measured on;
  - the posting's own vocabulary — the exact words it uses for those things.
If the page cannot be fetched, work from the profile alone and set
"jobPostTitle" to "Untitled role".

STEP 2 — MINE THE PROFILE EXHAUSTIVELY.
Each profile section arrives as a flat "description" string that often runs
several distinct accomplishments together in one blob. Split them back apart —
one accomplishment per bullet. Do not compress several accomplishments into a
single line, and do not drop any experience, project, skill, credential, or
award that is relevant to the posting. Any fact anywhere in the profile is
available for use.

STEP 3 — WRITE FOR THIS POSTING.
  - Lead with what the posting asks for. Order sections, entries, and bullets
    so the most job-relevant material comes first.
  - Mirror the posting's vocabulary: when the profile and the posting describe
    the same thing in different words, use the posting's words.
    THE LINE YOU MAY NOT CROSS — rephrasing a fact the user actually has is
    required; claiming a fact they do not have is forbidden. If the posting
    asks for something absent from the profile, leave it out entirely. Never
    bridge the gap with an invented, implied, or merely adjacent claim.
  - Write each bullet as: strong action verb -> what was built or done -> the
    specific technologies used -> the outcome, scale, or impact. Include a
    number ONLY if that exact number is already in the profile; never estimate,
    round, or invent one.
  - No first person, no "responsible for", no objective statement, no filler,
    no soft-skill padding that carries no evidence.
  - TECHNICAL SKILLS bullets use "label" for the category (e.g. "Languages:")
    and "text" for the comma-separated list. Put the posting's named
    technologies first, but only those the profile actually demonstrates.

STEP 4 — FILL THE PAGE.
The renderer fits the output to exactly one page and shrinks the font to make
it fit, so under-filling wastes the page and over-filling makes it unreadable.
Target 18-24 bullets across the whole resume, each roughly 15-25 words (one to
two printed lines). Aim for:
  - TECHNICAL SKILLS: 3-5 grouped bullets;
  - PROJECTS: 2-4 entries, 2-3 bullets each;
  - PROFESSIONAL EXPERIENCE: 2-4 entries, 2-3 bullets each;
  - EDUCATION: 2-4 bullets (degree and graduation first, then honours,
    scholarships, relevant coursework).
If the profile genuinely lacks material for a section, return that section with
an empty array rather than padding it. An empty section is dropped cleanly;
invented content is never acceptable.

STRUCTURAL RULES.
  - Use exactly the property names and the section "id" and "type" values from
    the skeleton. Do not add, rename, or drop any property.
  - Give every entry and bullet a unique, descriptive, kebab-case "id"
    (e.g. "bullet-exp-acme-01"). No id may repeat anywhere in the document.
  - Header: fill name, phone, and email from the profile. Include the
    LinkedIn / GitHub / portfolio parts only when the profile supplies that
    URL, and set both "text" (the label) and "href" (the URL). Use a
    "mailto:" href for email.
  - "jobPostTitle" must be the exact job title from the posting.
  - Return JSON only — no markdown, no commentary, no code fences.
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
