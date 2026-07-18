import type { ExportedProfile } from "../lib/profileExport.js";
import { loadResumeTemplate } from "../lib/templateRegistry.js";
import { loadResumeSchema } from "../lib/schema.js";
import type { Prisma } from "../../generated/prisma/client.js";
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

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash",

    input: `

    Given ${JSON.stringify(input, null, 2)} and the following;

    JOB POSTING URL:
    ${input2.URL}

    VERIFIED USER PROFILE:
    ${JSON.stringify(input2.userProfile, null, 2)}

    RETURN THE RESULT USING THIS STRUCTURE AND ONLY THIS STRUCTURE:
    ${JSON.stringify(selectedTemplate, null, 2)}

    I want to modify/review ${JSON.stringify(input, null, 2)} so that everything is tailored to the job posting. If enough space add additional information from the userProfile to the structure.
    Also bold any words you find important so but a /b before it ex. Python keep it as /bPython.

    - Never invent or infer skills, technologies, projects, employers,
      roles, education, dates, metrics, achievements, or responsibilities.
    - Do not reinterpret an existing fact as a different kind of experience.
    - Delete every claim in the draft that is not directly supported by
      the verified user profile.
    `,

    tools: [{ type: "url_context" }],

    response_format: {type: "text", mime_type: "application/json", schema: resumeSchema,},
  });

  const outputText = interaction.output_text;

  if (typeof outputText !== "string" || outputText.trim() === "") {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    const parsed: unknown = JSON.parse(outputText);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Gemini returned JSON that was not an object.");
    }

    return parsed as Prisma.InputJsonObject;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Gemini returned JSON that was not an object.") {
      throw error;
    }

    throw new Error("Gemini returned invalid JSON.");
  }
}
