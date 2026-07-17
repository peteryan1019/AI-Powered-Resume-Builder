import type { ExportedProfile } from "../lib/profileExport.js";
import { loadResumeTemplate } from "../lib/templateRegistry.js";
import { loadResumeSchema } from "../lib/schema.js";
import type { Prisma } from "../../generated/prisma/client.js";
import "dotenv/config";

import { GoogleGenAI } from "@google/genai";
const GEMINI_API_KEY = process.env.APIKEY_1;

if (!GEMINI_API_KEY) {
  throw new Error("dnwkdnk");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface TailorResumeInput {
  userProfile: ExportedProfile;
  jobPostingUrl: string;
  templateId: string;
}

export async function tailorResume(
  input: TailorResumeInput,
): Promise<Prisma.InputJsonObject> {
  const [selectedTemplate, resumeSchema] = await Promise.all([
    loadResumeTemplate(input.templateId),
    loadResumeSchema(),
  ]);

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash",

    input: `
    Tailor this resume to the job posting.

    JOB POSTING URL:
    ${input.jobPostingUrl}

    VERIFIED USER PROFILE:
    ${JSON.stringify(input.userProfile, null, 2)}

    RETURN THE RESULT USING THIS STRUCTURE AND ONLY THIS STRUCTURE:
    ${JSON.stringify(selectedTemplate, null, 2)}

    Rules:
    - Use only facts from the user profile.
    - Do not invent qualifications, experience, dates, skills, or metrics.
    - Keep the exact property names shown in the output structure.
    - Return JSON only.
    `,

    tools: [
      {
        type: "url_context",
      },
    ],

    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: resumeSchema,
    },
  });

  const outputText = interaction.output_text;

  console.log("First request complete");

  if (typeof outputText !== "string" || outputText.trim() === "") {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    const parsed: unknown = JSON.parse(outputText);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Gemini returned JSON that was not an object.");
    }

    return parsed as Prisma.InputJsonObject;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Gemini returned JSON that was not an object."
    ) {
      throw error;
    }

    throw new Error("Gemini returned invalid JSON.");
  }
}
