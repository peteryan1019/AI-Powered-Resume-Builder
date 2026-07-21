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

    Given ${JSON.stringify(input, null, 2)} and the following;

    JOB POSTING URL:
    ${input2.URL}

    VERIFIED USER PROFILE:
    ${JSON.stringify(input2.userProfile, null, 2)}

    RETURN THE RESULT USING THIS STRUCTURE AND ONLY THIS STRUCTURE:
    ${JSON.stringify(selectedTemplate, null, 2)}

    I want to modify/review ${JSON.stringify(input, null, 2)} so that everything is tailored to the job posting. If enough space add additional information from the userProfile to the structure.

    - Never invent or infer skills, technologies, projects, employers,
      roles, education, dates, metrics, achievements, or responsibilities.
    - Do not reinterpret an existing fact as a different kind of experience.
    - Delete every claim in the draft that is not directly supported by
      the verified user profile.
    - Preserve "jobPostTitle": it must be the exact job title from the job
      posting at the URL. If the draft's value looks wrong, correct it.
    `,

      tools: [{ type: "url_context" }],

      response_format: {type: "text", mime_type: "application/json", schema: resumeSchema,},
    });

    return parseAndValidateResumeOutput(interaction.output_text, resumeSchema);
  });
}
