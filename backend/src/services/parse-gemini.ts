import type {Prisma, SectionType} from '../../generated/prisma/client.js';
import "dotenv/config";
import { loadProfileSchema } from "../lib/schema.js";
import { GoogleGenAI } from "@google/genai";
import { FASTEST_GEMINI_TEXT_MODEL } from "./geminiRetry.js"
const GEMINI_API_KEY = process.env.APIKEY_3;

if (!GEMINI_API_KEY) {
  throw new Error("dnwkdnk");
}
const Prompt = `
Perform lossless resume extraction. Do not summarize or combine separately
named entries.

AWARDS:
- Create one AWARDS instance for every separately named contest, honour,
  scholarship, ranking, or award.
- Never combine multiple math contests into one "Math Contests" entry.
- data.title must contain the exact contest or award name.
- data.description must contain the complete result, ranking, score,
  distinction, and other associated text.
- Preserve the date in data.date when available.

VOLUNTEER:
- Classify unpaid community service, charity work, community events,
  nonprofit involvement, and volunteer roles as VOLUNTEER.
- Do not classify volunteer activities as PROJECTS.
- data.title should contain the role or activity.
- data.description should preserve all related descriptions and bullet points.

PROJECTS:
- Use PROJECTS only for something the person built, designed, implemented,
  researched, or developed.
- Do not use PROJECTS merely because an activity involved organizing or
  participating in an event.

For every section:
- Create one instance for each distinct entry.
- Preserve all descriptions and bullet points.
- Never replace several named entries with a general category.
- Use an empty string for description only when the resume genuinely provides
  no descriptive information.
- Do not invent information.

The data shape must match the parent section type exactly:

WORK_EXPERIENCE → company, title, location, summary, technologies,
startDate, endDate, current, bullets, customDetails.

EDUCATION → school, degree, field, gpa, startDate, endDate, bullets.

SKILLS → category, skills.

PROJECTS → name, url, summary, technologies, startDate, endDate,
current, bullets, customDetails.

CERTIFICATIONS → name, issuer, date, url.

AWARDS → title, issuer, date, description.

LANGUAGES → language, proficiency.

VOLUNTEER → organization, role, startDate, endDate, current, bullets.

Never use fields belonging to a different section type.
Do not create empty instances.
Create a separate instance for every separately named entry.
`;

export interface ImportedProfile {
  profile: {
    headline: string | null;
    phone: string | null;
    location: string | null;
    summary: string | null;
    linkedin: string | null;
    github: string | null;
    portfolio: string | null;
  };

  sections: Array<{
    type: SectionType;
    label: string;

    instances: Array<{
      data: Prisma.InputJsonObject;
    }>;
  }>;
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function extractResume(input: Buffer): Promise<ImportedProfile> {

    const resumeSchema = await loadProfileSchema();

    const interaction = await ai.interactions.create({
        model: FASTEST_GEMINI_TEXT_MODEL,

        input: [
            {
                type: 'document',
                data: input.toString('base64'),
                mime_type: 'application/pdf'
            },
            {
                type: 'text',
                text: Prompt
            },
        ],

        response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: resumeSchema,
        },
    });

    if(!interaction.output_text){
        throw new Error('Gemini returned an empty response');
    }

    return JSON.parse(interaction.output_text) as ImportedProfile;
}