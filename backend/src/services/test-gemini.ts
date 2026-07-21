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
    Tailor this resume to the job posting.

    JOB POSTING URL:
    ${input.URL}

    VERIFIED USER PROFILE:
    ${JSON.stringify(input.userProfile, null, 2)}

    RETURN THE RESULT USING THIS STRUCTURE AND ONLY THIS STRUCTURE:
    ${JSON.stringify(selectedTemplate, null, 2)}

    Rules:
    - Use only facts from the user profile.
    - Do not invent qualifications, experience, dates, skills, or metrics.
    - Keep the exact property names shown in the output structure.
    - Set "jobPostTitle" to the exact job title from the job posting at the URL
      (e.g. "Senior Backend Engineer"). If you cannot determine it, use "Untitled role".
    - Return JSON only.
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
