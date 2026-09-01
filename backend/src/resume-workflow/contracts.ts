import type { Prisma } from "../../generated/prisma/client.js";
import type { ExportedProfile } from "../lib/profileExport.js";
import type { JobPostSource } from "../services/jobPost.js";

export const WORKFLOW_VERSION = 1;
export const COACH_PASS_SCORE = 90;
export const MAX_COACH_ROUNDS = 3;

export type BuildStatus =
  | "queued"
  | "generating"
  | "checking"
  | "awaiting_feedback"
  | "revising"
  | "generating_pdf"
  | "done"
  | "error";

export interface BuildInput {
  workflowVersion: number;
  buildId: string;
  userId: string;
  jobPost: JobPostSource;
  templateId: string;
  createdAt: string;
}

export interface BuildMetadata {
  buildId: string;
  userId: string;
  status: BuildStatus;
  templateId: string;
  createdAt: string;
  resumeId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export type CoachCriterionKey =
  | "truthfulness"
  | "jobCoverage"
  | "relevance"
  | "impact"
  | "atsAlignment"
  | "readability"
  | "pageUse";

export interface CoachCriterion {
  key: CoachCriterionKey;
  label: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export type RecommendationCategory =
  | "PROJECT_SELECTION"
  | "CONTENT"
  | "SKILLS"
  | "STRUCTURE"
  | "WORDING";

export interface CoachRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  rationale: string;
  proposedChange: string;
  requiresUserInput: boolean;
  candidateSourceIds: string[];
}

export interface CoachReview {
  reviewId: string;
  round: number;
  overallScore: number;
  passes: boolean;
  summary: string;
  criteria: CoachCriterion[];
  recommendations: CoachRecommendation[];
}

export interface NewProjectInput {
  name: string;
  description: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export interface RecommendationDecision {
  recommendationId: string;
  decision: "accept" | "reject";
  specification?: string;
  existingProjectSourceId?: string;
  newProject?: NewProjectInput;
}

export interface ResumeWorkflowResumeInput {
  reviewId: string;
  decisions: RecommendationDecision[];
  refreshedProfile: ExportedProfile;
}

export interface ReviewProjection extends CoachReview {
  projectCandidates: Array<{
    sourceId: string;
    title: string;
    date: string;
    description: string;
  }>;
}

export interface ResumeWorkflowState {
  workflowVersion: number;
  buildId: string;
  userId: string;
  jobPost: JobPostSource;
  templateId: string;
  profile: ExportedProfile;
  draft: Prisma.InputJsonObject;
  review: CoachReview | null;
  acceptedDecisions: RecommendationDecision[];
  round: number;
  resumeId: string | null;
}

/**
 * Every node in the LangGraph workflow. These are the exact keys passed to
 * `.addNode(...)` in graph.ts, and the same strings the topology endpoint
 * returns, so the UI can key its diagram off them.
 */
export type WorkflowNodeName =
  | "draft_resume"
  | "coach"
  | "publish_review"
  | "human_review"
  | "revise"
  | "finalize";

/** One node's entry in the run trace. Emitted when the node begins. */
export interface NodeStartEvent {
  node: WorkflowNodeName;
  round: number;
  at: number;
}

/**
 * One node's exit. `durationMs` is present only where the node measured its own
 * work; `human_review` is closed by the worker when the resume job starts, so
 * its span is derived from the start/end `at` stamps instead.
 */
export interface NodeEndEvent {
  node: WorkflowNodeName;
  round: number;
  at: number;
  durationMs?: number;
  /** coach: the score it gave, whether that passes, and the bar it had to clear. */
  score?: number;
  passes?: boolean;
  threshold?: number;
  maxRounds?: number;
  /** coach: how many recommendations it raised. revise: how many were applied. */
  recommendations?: number;
  accepted?: number;
  /** finalize: whether the PDF was rendered or an existing one was reused. */
  reusedExisting?: boolean;
}

export interface BuildEvent {
  type:
    | "state"
    | "node_start"
    | "node_end"
    | "review_ready"
    | "complete"
    | "job_post_unreadable"
    | "build_error";
  data: Record<string, unknown>;
}
