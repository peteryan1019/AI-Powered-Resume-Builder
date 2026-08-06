import type { ExportedProfile } from "../lib/profileExport.js";

/**
 * Where one build gets the posting's content from.
 *
 * `url` is the normal path: the AI fetches the page itself via url_context.
 * `text` is the fallback used after a fetch turned up nothing — the user pastes
 * the description and it is handed to the AI verbatim, with no retrieval.
 */
export type JobPostSource =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

export interface TailorResumeInput {
  userProfile: ExportedProfile;
  jobPost: JobPostSource;
  templateId: string;
}

/**
 * Sentinel `jobPostTitle` the generating AI returns instead of a resume when it
 * could not see any of the posting's content (fetch blocked, login wall, empty
 * page). The schema pins the response to one object shape with
 * `additionalProperties: false`, so this reserved title — paired with an empty
 * `sections` array — is how the model raises the flag without a schema change.
 *
 * `runBuildPipeline` checks for it right after the first AI call and aborts
 * before any further AI or PDF work happens.
 */
export const JOB_POST_UNREADABLE_TITLE = "__JOB_POST_UNREADABLE__";

/** Resume title fallback for builds that came from pasted text, not a URL. */
export const PASTED_JOB_POST_TITLE = "Pasted job description";

/** Thrown when the generating AI reports it could not read the posting. */
export class JobPostUnreadableError extends Error {
  constructor() {
    super("The job posting could not be read from its URL.");
    this.name = "JobPostUnreadableError";
  }
}

/** True when the AI's output carries the "I could not see the posting" flag. */
export function isJobPostUnreadable(resume: unknown): boolean {
  if (typeof resume !== "object" || resume === null) {
    return false;
  }

  const title = (resume as Record<string, unknown>).jobPostTitle;
  return (
    typeof title === "string" && title.trim() === JOB_POST_UNREADABLE_TITLE
  );
}
