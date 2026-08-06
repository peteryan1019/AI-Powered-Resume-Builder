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
Perform lossless resume extraction. Preserve the meaning, ownership, and
structure of every piece of information. Do not summarize, infer, merge, or
promote information from one context into another.

PROFILE-LEVEL FIELDS:

- Profile-level fields describe the person generally and may only be extracted
  from the resume header or an explicit profile/summary section.
- Populate the profile headline only when the resume contains a distinct
  professional headline or tagline in its header.
- Never use a work-experience job title, volunteer role, project role, target
  job title, filename, or most recent position as the profile headline.
- In particular, a role such as "Software Developer Intern" inside a Nokia work
  entry belongs only to that WORK_EXPERIENCE instance.
- If the resume does not explicitly provide a profile headline, use an empty
  string.
- Populate the profile location only from a location or address presented as
  part of the person's contact/header information.
- Never use an employer's location as the profile location.
- Do not infer a profile headline, location, or summary from other entries.

WORK EXPERIENCE:

- Create a separate WORK_EXPERIENCE instance for every distinct role.
- Preserve the exact employer name in data.company.
- Preserve the exact job title in data.title.
- Preserve the complete location associated with that specific job in
  data.location, including city, province/state, country, and designations such
  as Remote or Hybrid when provided.
- A location printed beside an employer, job title, or employment date belongs
  to that WORK_EXPERIENCE instance, not to the profile.
- Never omit a job location merely because it appears on the same line as the
  employer or employment dates.
- Never copy the person's profile location into a job that does not explicitly
  provide a location.
- If a particular job has no stated location, use an empty string.
- Preserve prose descriptions in data.summary.
- Preserve every separate bullet point as a separate item in data.bullets.
- Do not merge bullets into the summary.
- Populate data.technologies only with technologies explicitly connected to
  that role.
- Preserve all stated employment dates and whether the role is current.
- If one employer contains multiple separately named roles, create a separate
  instance for each role unless the schema explicitly supports nested roles.

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
- data.organization must contain the organization when one is provided.
- data.role must contain the role or activity.
- Preserve every related bullet point separately in data.bullets.
- Preserve all stated dates and whether the role is current.

PROJECTS:

- Use PROJECTS only for something the person built, designed, implemented,
  researched, or developed.
- Do not use PROJECTS merely because an activity involved organizing or
  participating in an event.
- Preserve the exact project name in data.name.
- Preserve prose descriptions in data.summary.
- Preserve every separate bullet point as a separate item in data.bullets.
- Populate technologies only when they are explicitly associated with the
  project.

FIELD OWNERSHIP:

- Interpret information according to the entry it visually and semantically
  belongs to.
- Do not promote information from an individual entry into a profile-level
  field.
- Do not move information between section types merely because the destination
  has a similarly named field.
- A job title belongs to its work entry, not the profile headline.
- A job location belongs to its work entry, not the profile location.
- A header location belongs to the profile, not automatically to every job.
- When information is absent, use the schema's empty value instead of copying,
  inferring, or inventing a value.

For every section:

- Create one instance for each distinct entry.
- Preserve all descriptions and bullet points.
- Preserve the association between each field and its original entry.
- Never replace several named entries with a general category.
- Use an empty string for description only when the resume genuinely provides
  no descriptive information.
- Do not invent information.
- Do not create empty instances.

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