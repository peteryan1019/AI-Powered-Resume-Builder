import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import { reviseResume } from "../services/check-gemini.js";
import { coachResume } from "../services/coach-gemini.js";
import {
  isJobPostUnreadable,
  JobPostUnreadableError,
  PASTED_JOB_POST_TITLE,
} from "../services/jobPost.js";
import { measureResumeFill, renderResume } from "../services/resumeRender.js";
import { tailorResume } from "../services/test-gemini.js";
import {
  COACH_PASS_SCORE,
  MAX_COACH_ROUNDS,
  type CoachRecommendation,
  type WorkflowNodeName,
  type RecommendationDecision,
  type ResumeWorkflowResumeInput,
  type ResumeWorkflowState,
} from "./contracts.js";
import {
  patchBuildMetadata,
  publishBuildEvent,
  putReviewProjection,
  REDIS_URL,
  WORKFLOW_TTL_SECONDS,
} from "./redis.js";

const WorkflowState = Annotation.Root({
  workflowVersion: Annotation<number>(),
  buildId: Annotation<string>(),
  userId: Annotation<string>(),
  jobPost: Annotation<ResumeWorkflowState["jobPost"]>(),
  templateId: Annotation<string>(),
  profile: Annotation<ResumeWorkflowState["profile"]>(),
  draft: Annotation<Prisma.InputJsonObject>(),
  review: Annotation<ResumeWorkflowState["review"]>(),
  acceptedDecisions: Annotation<RecommendationDecision[]>(),
  /** Every decision, refusals included, so the writer and the coach see both. */
  decisions: Annotation<RecommendationDecision[]>(),
  /** What the user chose to do next, rather than something inferred for them. */
  nextStep: Annotation<"revise" | "finalize">(),
  /** A note about the build as a whole, not tied to any recommendation. */
  note: Annotation<string>(),
  /**
   * Profile entries the user added or corrected during this review. They are
   * already in `profile`, but the writer needs telling that they changed and
   * were the user's answer to this round -- otherwise rejecting every
   * recommendation and fixing the profile produces a rewrite that ignores it.
   */
  profileChangeLabels: Annotation<string[]>(),
  round: Annotation<number>(),
  resumeId: Annotation<string | null>(),
});

type State = typeof WorkflowState.State;

async function emitState(
  buildId: string,
  status: "generating" | "checking" | "revising" | "generating_pdf",
  label: string,
  step: number,
): Promise<void> {
  await patchBuildMetadata(buildId, { status });
  await publishBuildEvent(buildId, {
    type: "state",
    data: { state: status, label, step, total: 4 },
  });
}

/**
 * The run trace. Every node publishes a `node_start` before it works and a
 * `node_end` when it finishes, so the UI can replay the path actually taken
 * through the graph and time each stage. The ORDER of `node_start` events is
 * the path, which is why no separate branch-decision event is needed: if
 * `publish_review` follows `coach`, routeAfterCoach chose publish_review.
 *
 * A node that throws publishes no `node_end`, which is exactly how the UI
 * recognises the stage that failed.
 */
async function nodeStarted(
  buildId: string,
  node: WorkflowNodeName,
  round: number,
): Promise<number> {
  await publishBuildEvent(buildId, {
    type: "node_start",
    data: { node, round, at: Date.now() },
  });
  return Date.now();
}

async function nodeEnded(
  buildId: string,
  node: WorkflowNodeName,
  round: number,
  startedAt: number,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const at = Date.now();
  await publishBuildEvent(buildId, {
    type: "node_end",
    data: { node, round, at, durationMs: at - startedAt, ...detail },
  });
}

async function draftNode(state: State): Promise<Partial<State>> {
  const startedAt = await nodeStarted(
    state.buildId,
    "draft_resume",
    state.round,
  );
  await emitState(state.buildId, "generating", "Generating resume", 1);
  const draft = await tailorResume({
    userProfile: state.profile,
    jobPost: state.jobPost,
    templateId: state.templateId,
  });

  if (isJobPostUnreadable(draft)) throw new JobPostUnreadableError();
  await nodeEnded(state.buildId, "draft_resume", state.round, startedAt);
  return { draft };
}

async function coachNode(state: State): Promise<Partial<State>> {
  const startedAt = await nodeStarted(state.buildId, "coach", state.round);
  await emitState(state.buildId, "checking", "Coach review", 2);
  const fill = await measureResumeFill(state.draft, state.templateId);
  const review = await coachResume({
    resume: state.draft,
    profile: state.profile,
    jobPost: state.jobPost,
    fill,
    round: state.round,
  });

  await nodeEnded(state.buildId, "coach", state.round, startedAt, {
    score: review.overallScore,
    passes: review.passes,
    threshold: COACH_PASS_SCORE,
    maxRounds: MAX_COACH_ROUNDS,
    recommendations: review.recommendations.length,
  });
  return { review };
}

function routeAfterCoach(state: State): "publish_review" | "finalize" {
  // Publish the review even when the draft passes. A high score means the coach
  // is satisfied, not that the user is: they may know about a project the
  // profile never listed, and only they can say the resume is finished. The
  // round cap remains the one thing that ends the loop on its own.
  return state.review && state.round < MAX_COACH_ROUNDS
    ? "publish_review"
    : "finalize";
}

async function publishReviewNode(state: State): Promise<Partial<State>> {
  if (!state.review) throw new Error("Cannot publish an empty coach review.");
  const startedAt = await nodeStarted(
    state.buildId,
    "publish_review",
    state.round,
  );
  await putReviewProjection(state.buildId, state.review);
  await patchBuildMetadata(state.buildId, { status: "awaiting_feedback" });
  await nodeEnded(state.buildId, "publish_review", state.round, startedAt);
  // human_review is a synchronous node built around LangGraph's interrupt(),
  // so it cannot publish anything itself. Open its span here; the worker closes
  // it when the resume job carrying the user's decisions arrives. Both events
  // go out BEFORE review_ready, because the SSE route calls res.end() on that.
  await nodeStarted(state.buildId, "human_review", state.round);
  await publishBuildEvent(state.buildId, {
    type: "review_ready",
    data: {
      reviewId: state.review.reviewId,
      score: state.review.overallScore,
      round: state.review.round,
    },
  });
  return {};
}

function humanReviewNode(state: State): Partial<State> {
  if (!state.review) throw new Error("Cannot pause without a coach review.");
  const response = interrupt<
    { reviewId: string; score: number; recommendations: CoachRecommendation[] },
    ResumeWorkflowResumeInput
  >({
    reviewId: state.review.reviewId,
    score: state.review.overallScore,
    recommendations: state.review.recommendations,
  });

  if (response.reviewId !== state.review.reviewId) {
    throw new Error("The feedback response belongs to an older review round.");
  }

  return {
    profile: response.refreshedProfile,
    decisions: response.decisions,
    acceptedDecisions: response.decisions.filter(
      (item) => item.decision === "accept",
    ),
    nextStep: response.nextStep,
    ...(response.note ? { note: response.note } : {}),
    profileChangeLabels: (response.profileChanges ?? []).map((item) =>
      item.mode === "update" ? `updated ${item.label}` : `added ${item.label}`,
    ),
  };
}

function routeAfterHuman(state: State): "revise" | "finalize" {
  // The user decides. Rejecting every recommendation and then adding a project
  // the profile was missing is still a reason to rewrite the resume, which is
  // why this no longer infers the answer from the accepted count.
  if (state.nextStep) return state.nextStep;
  // Checkpoints written before that choice existed still route the old way.
  return state.acceptedDecisions.length > 0 ? "revise" : "finalize";
}

/**
 * The block of instructions handed to the writer. It carries refusals as well as
 * approvals: a recommendation the user turned down has to be stated as a
 * prohibition, or nothing stops the writer making the same change on its own
 * initiative and the user sees their objection ignored.
 */
function decisionInstructionsText(state: State): string {
  const recommendations = new Map(
    (state.review?.recommendations ?? []).map((item) => [item.id, item]),
  );
  const describe = (decision: RecommendationDecision): string => {
    const recommendation = recommendations.get(decision.recommendationId);
    return [
      recommendation
        ? `${recommendation.title}: ${recommendation.proposedChange}`
        : "Coach recommendation",
      decision.specification
        ? `${
            decision.decision === "accept"
              ? "User specification"
              : "The user's reason"
          }: ${decision.specification}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  // Older checkpoints have no `decisions` channel; fall back to the accepted set.
  const all = state.decisions ?? state.acceptedDecisions ?? [];
  const accepted = all.filter((item) => item.decision === "accept");
  const rejected = all.filter((item) => item.decision === "reject");
  const blocks: string[] = [];
  if (accepted.length) {
    blocks.push(
      `APPROVED — make these changes:\n${accepted.map(describe).join("\n\n")}`,
    );
  }
  if (rejected.length) {
    blocks.push(
      `REFUSED — do not make these changes, and do not reintroduce them by another route:\n${rejected
        .map(describe)
        .join("\n\n")}`,
    );
  }
  if (state.profileChangeLabels?.length) {
    blocks.push(
      `THE USER JUST CHANGED THEIR VERIFIED PROFILE: ${state.profileChangeLabels.join(
        "; ",
      )}\nThese were their answer to this review, so use them where they are relevant to the posting. A claim the coach doubted may now be supported by the profile.`,
    );
  }
  if (state.note) {
    blocks.push(`ALSO REQUESTED BY THE USER:\n${state.note}`);
  }
  return blocks.join("\n\n");
}

async function reviseNode(state: State): Promise<Partial<State>> {
  const startedAt = await nodeStarted(state.buildId, "revise", state.round);
  await emitState(state.buildId, "revising", "Applying approved feedback", 3);
  const fill = await measureResumeFill(state.draft, state.templateId);
  const draft = await reviseResume(
    state.draft,
    {
      userProfile: state.profile,
      jobPost: state.jobPost,
      templateId: state.templateId,
    },
    fill,
    `[resume-build ${state.buildId.slice(0, 8)}]`,
    decisionInstructionsText(state),
  );
  await nodeEnded(state.buildId, "revise", state.round, startedAt, {
    accepted: state.acceptedDecisions.length,
  });
  return { draft, round: state.round + 1, review: null, acceptedDecisions: [] };
}

function postingTitle(state: State): string {
  const value = (state.draft as Record<string, unknown>).jobPostTitle;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (state.jobPost.kind === "text") return PASTED_JOB_POST_TITLE;
  try {
    return new URL(state.jobPost.url).hostname;
  } catch {
    return state.jobPost.url;
  }
}

async function finalizeNode(state: State): Promise<Partial<State>> {
  const startedAt = await nodeStarted(state.buildId, "finalize", state.round);
  await emitState(state.buildId, "generating_pdf", "Generating PDF", 4);

  const existing = await prisma.resume.findUnique({
    where: { buildId: state.buildId },
    select: { id: true },
  });
  if (existing) {
    await patchBuildMetadata(state.buildId, {
      status: "done",
      resumeId: existing.id,
    });
    await nodeEnded(state.buildId, "finalize", state.round, startedAt, {
      reusedExisting: true,
    });
    await publishBuildEvent(state.buildId, {
      type: "complete",
      data: { resumeId: existing.id },
    });
    return { resumeId: existing.id };
  }

  const { pdf: pdfData } = await renderResume(state.draft, state.templateId);
  const resume = await prisma.resume.create({
    data: {
      buildId: state.buildId,
      userId: state.userId,
      title: postingTitle(state),
      templateId: state.templateId,
      URL: state.jobPost.kind === "url" ? state.jobPost.url : "",
      content: state.draft,
      pdfData,
    },
    select: { id: true },
  });

  await patchBuildMetadata(state.buildId, {
    status: "done",
    resumeId: resume.id,
  });
  await nodeEnded(state.buildId, "finalize", state.round, startedAt, {
    reusedExisting: false,
  });
  await publishBuildEvent(state.buildId, {
    type: "complete",
    data: { resumeId: resume.id },
  });
  return { resumeId: resume.id };
}

let graphPromise: Promise<ReturnType<typeof createGraph>> | undefined;

function createGraph(checkpointer: RedisSaver) {
  return new StateGraph(WorkflowState)
    .addNode("draft_resume", draftNode)
    .addNode("coach", coachNode)
    .addNode("publish_review", publishReviewNode)
    .addNode("human_review", humanReviewNode)
    .addNode("revise", reviseNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "draft_resume")
    .addEdge("draft_resume", "coach")
    .addConditionalEdges("coach", routeAfterCoach, {
      publish_review: "publish_review",
      finalize: "finalize",
    })
    .addEdge("publish_review", "human_review")
    .addConditionalEdges("human_review", routeAfterHuman, {
      revise: "revise",
      finalize: "finalize",
    })
    .addEdge("revise", "coach")
    .addEdge("finalize", END)
    .compile({ checkpointer });
}

export async function getResumeWorkflowGraph() {
  // A rejected promise is neither null nor undefined, so `??=` would treat one
  // as "already built" and hand the same failure to every later job. Clear the
  // cache on failure so the next job gets a fresh attempt.
  graphPromise ??= RedisSaver.fromUrl(REDIS_URL, {
    defaultTTL: Math.ceil(WORKFLOW_TTL_SECONDS / 60),
    refreshOnRead: true,
  })
    .then((checkpointer) => createGraph(checkpointer))
    .catch((error) => {
      graphPromise = undefined;
      throw error;
    });
  return graphPromise;
}

/**
 * The draft as it stands right now, read from the LangGraph checkpoint rather
 * than copied into a second Redis key. That keeps one source of truth and means
 * builds already paused at human_review can be previewed without a re-run.
 * Returns null when the build has no checkpoint yet or has not drafted.
 */
export async function getBuildDraft(
  buildId: string,
): Promise<Prisma.InputJsonObject | null> {
  const compiled = await getResumeWorkflowGraph();
  const snapshot = await compiled.getState(workflowConfig(buildId));
  const draft = (snapshot?.values as { draft?: Prisma.InputJsonObject } | undefined)
    ?.draft;
  return draft && Object.keys(draft).length > 0 ? draft : null;
}

export interface WorkflowTopologyEdge {
  source: string;
  target: string;
  conditional: boolean;
}

export interface WorkflowTopology {
  nodes: string[];
  edges: WorkflowTopologyEdge[];
}

/**
 * The graph's real shape, read back out of the compiled LangGraph rather than
 * hand-copied into the UI. Rewiring createGraph() therefore changes the diagram
 * with no frontend edit, and the picture can never claim a path the worker
 * cannot actually take.
 */
export async function getWorkflowTopology(): Promise<WorkflowTopology> {
  const compiled = await getResumeWorkflowGraph();
  const drawable = compiled.getGraph();
  return {
    nodes: Object.values(drawable.nodes).map((node) => node.id),
    edges: drawable.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      conditional: Boolean(edge.conditional),
    })),
  };
}

export function workflowConfig(buildId: string) {
  return { configurable: { thread_id: buildId } };
}

export { Command };
