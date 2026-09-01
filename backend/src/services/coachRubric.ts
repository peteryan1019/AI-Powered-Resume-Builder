import type { CoachCriterionKey } from "../resume-workflow/contracts.js";

export const COACH_RUBRIC: ReadonlyArray<{
  key: CoachCriterionKey;
  label: string;
  maxScore: number;
}> = [
  { key: "truthfulness", label: "Truthfulness and grounding", maxScore: 30 },
  { key: "jobCoverage", label: "Job requirement coverage", maxScore: 25 },
  { key: "relevance", label: "Evidence relevance", maxScore: 15 },
  { key: "impact", label: "Impact and specificity", maxScore: 10 },
  { key: "atsAlignment", label: "ATS and keyword alignment", maxScore: 10 },
  { key: "readability", label: "Readability", maxScore: 5 },
  { key: "pageUse", label: "One-page use", maxScore: 5 },
];
