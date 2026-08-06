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

In this prompt, "strongest" means most useful and relevant for this specific
job—not most prestigious or impressive in general.

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

Distinguish core selection criteria from broad eligibility statements. For
example, accepting candidates from mathematics does not automatically make
every mathematics-related achievement relevant to the work being performed.

If the page cannot be fetched, work from the profile alone and set
"jobPostTitle" to "Untitled role".

STEP 2 — EVALUATE THE COMPLETE PROFILE.

Evaluate facts from EVERY profile category, including work experience,
volunteer experience, projects, education, skills, certifications, awards,
languages, and any custom information.

Each profile section may contain several accomplishments combined inside one
"description" string. Split those accomplishments apart internally and
consider each one separately.

Exhaustive evaluation does not mean exhaustive inclusion. Examine every
profile fact, but include only evidence that materially strengthens this
specific application.

Classify every profile fact by JOB RELEVANCE, not by general prestige:

  1. DIRECT EVIDENCE:
     Specifically demonstrates a core responsibility, technology, skill,
     qualification, or expected outcome from the posting.

  2. SUPPORTING EVIDENCE:
     Demonstrates a useful transferable capability that is not already shown
     more directly.

  3. PRESTIGE-ONLY EVIDENCE:
     Impressive, selective, unusual, or highly ranked, but does not materially
     demonstrate the work requested by this posting.

  4. IRRELEVANT EVIDENCE:
     Does not meaningfully strengthen the application for this role.

Select DIRECT evidence first. Include SUPPORTING evidence only when it adds a
qualification or dimension not already demonstrated more directly. Omit
PRESTIGE-ONLY and IRRELEVANT evidence even when it is objectively impressive
and even when unused space remains.

Relevance is a gate. Impressiveness, selectivity, metrics, and prestige are
tie-breakers only between facts with similar job relevance.

A fact is not automatically relevant merely because:
  - it is highly ranked or competitive;
  - it contains an impressive metric;
  - it is connected to an accepted degree or field;
  - it demonstrates general intelligence or ambition;
  - it appeared on the candidate's previous resume.

For example, mathematics contests may be directly relevant to some
quantitative, mathematical, or competition-focused roles. They are not
automatically relevant to a software-development role merely because the
posting accepts mathematics students.

Prefer recent university-level experience, projects, education, and
achievements over high-school material.

Omit high-school awards, contests, clubs, and achievements once the candidate
has substantial university-level evidence, unless the posting explicitly
values that exact kind of achievement or it demonstrates a central
qualification that stronger recent evidence does not demonstrate.

When multiple profile items demonstrate the same qualification, retain the one
or two most directly relevant sources of evidence. Do not include weaker or
more indirect material merely because it supports the same qualification.

This comparison applies between competing profile items. It does not mean
discarding distinct accomplishments within a selected high-value project or
experience.

Use only verified facts from the profile. Never invent or infer a skill,
technology, project, employer, role, credential, date, metric, achievement,
responsibility, or outcome.

STEP 3 — CREATE THE SECTION STRUCTURE.

Organize the selected facts into as few non-empty sections as necessary,
commonly 2-5. There is no minimum section count.

Create, omit, rename, and order sections according to their usefulness for the
posting. The profile's original categories and the resume's displayed sections
do not need to match exactly.

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

Create a standalone section only when its content is central to the posting or
substantial enough to justify its own heading. Otherwise, place the material
inside the most natural relevant section or omit it.

Every section must earn its place:

  - Include Projects when selected projects directly demonstrate core
    responsibilities or qualifications from the posting.
  - Include Technical Skills when the posting requests specific technologies
    or when the skills materially help evaluate the candidate.
  - Include Awards or Distinctions only when the actual achievements materially
    support this posting, not merely because they are prestigious.
  - Include certifications, languages, volunteer work, teaching, and leadership
    only when they provide direct or meaningful supporting evidence.
  - Do not include technical projects or programming tools merely because a
    posting broadly accepts computer-science students.
  - Prefer direct experience over indirect evidence, specific demonstrated
    accomplishments over broad unsupported lists, and recent evidence over old
    evidence when their relevance is otherwise comparable.

Examples:
  - academic awards and distinctions may appear as Education bullets when they
    are relevant enough to retain;
  - certifications may appear under Skills or Education, or in a standalone
    Certifications section;
  - spoken languages may appear under Skills or in a standalone Languages
    section;
  - volunteer tutoring may appear in Teaching Experience, Volunteer
    Experience, or an accurately titled broader Experience section;
  - a prestigious but unrelated contest should be omitted rather than placed in
    a standalone section.

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
    relevant method or technology when useful -> verified outcome, scale, or
    impact when available.
  - Do not force technologies, methods, or metrics into a bullet when they are
    not important or not supplied by the profile.
  - Include a number only if that exact number appears in the profile.
  - Use one distinct accomplishment per bullet.
  - Do not use first person, "responsible for", unsupported soft-skill padding,
    or objective statements.
  - Remove genuine repetition across sections and bullets.

DEPTH BEFORE BREADTH.

When choosing between retaining a weak or indirectly relevant section and
giving sufficient detail to a directly relevant project or experience, remove
the weaker section and use the space to explain the stronger evidence.

When a selected project directly supports core requirements and the profile
contains multiple distinct verified accomplishments, normally give that
project 2-4 substantive bullets.

Use one substantive bullet only when:
  - the project or entry is secondary;
  - the profile supplies only one relevant verified accomplishment; or
  - additional bullets would genuinely repeat the same fact.

Do not reduce a major relevant project to one vague bullet while retaining a
less relevant section. Do not compress distinct implementation, testing,
security, collaboration, design, and outcome facts into one generic bullet.

For a technical-skills section, use "label" for the category, such as
"Languages:", and "text" for the comma-separated values. Put technologies named
in the posting first, but only when the profile supports them.

Use "Spoken Languages:" for human languages so they are not confused with
programming languages.

PRESERVE VERIFIED LINKS.

When an included project or certification supplies a URL in the verified
profile, preserve that exact URL in the corresponding entry.

Represent it as exactly one link bullet with:
  - a unique descriptive "id";
  - "label": "Project Link:" for a project or "Credential:" for a certification;
  - "text": "";
  - "url": the exact verified URL.

Do not rewrite, shorten, infer, or move a URL to a different entry. Do not place
the URL inside the heading, meta, date, or ordinary bullet text.

A link bullet does not count as a substantive accomplishment bullet. Do not
omit a verified URL merely to meet a suggested content count.

STEP 5 — SELECT CONTENT FOR ONE PAGE.

Create a focused one-page resume using only the amount of content justified by
the posting and verified profile. There is no minimum section, bullet, or
content-item count.

Most resumes will contain approximately 8-18 substantive bullets or equivalent
content items across approximately 2-5 sections. These are broad ranges, not
targets or quotas. Relevance determines the final length.

Relevance is a gate; impressiveness is only a tie-breaker.

Do not remove detailed, directly relevant project or experience evidence to
make room for a more prestigious but less relevant award, contest, credential,
or achievement.

Allocate space according to evidence value, not category coverage. Before
finalizing, check:

  - Does every section materially strengthen this specific application?
  - Does a major relevant project have enough bullets to explain why it matters?
  - Is a weaker section consuming space that should instead support a stronger
    project or experience?
  - Has an entry been reduced to one vague bullet despite the profile supplying
    several distinct relevant accomplishments?
  - Is any fact present primarily because it is impressive rather than relevant?
  - Is the same qualification demonstrated repeatedly by weaker evidence?

Prefer three strong bullets for a directly relevant project over an entire
weakly relevant awards or distinctions section.

Do not add a section or retain an item merely to fill space. Whitespace is
preferable to indirect evidence, repeated qualifications, weakly related
projects, generic skill lists, excessive compression, or smaller text.

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
  - Fill the header name, phone, and email only from the verified profile.
  - Include LinkedIn, GitHub, and portfolio contact parts only when the profile
    supplies their URLs.
  - Set both "text" and "href" for linked contact parts.
  - Use a "mailto:" href for email.
  - Set "jobPostTitle" to the exact posting title.
  - Return JSON only: no markdown, commentary, critique, or code fences.

The exact section shapes are:

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

    Every ordinary bullet contains "id" and "text", and may also contain "label"
    and "url".

    A project or certification link uses:
    { "id", "label": "Project Link:" or "Credential:", "text": "", "url" }

    The URL must be copied exactly from the matching verified profile item.

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
