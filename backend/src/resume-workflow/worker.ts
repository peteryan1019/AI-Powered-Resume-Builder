import "dotenv/config";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { getExportedProfile } from "../services/profileExportJSON.js";
import { AiModelUnavailableError } from "../services/geminiRetry.js";
import { JobPostUnreadableError } from "../services/jobPost.js";
import type { ResumeWorkflowResumeInput } from "./contracts.js";
import { Command, getResumeWorkflowGraph, workflowConfig } from "./graph.js";
import { RESUME_BUILD_QUEUE } from "./queue.js";
import {
  getBuildInput,
  getResumeCommand,
  getReviewProjection,
  patchBuildMetadata,
  publishBuildEvent,
  REDIS_URL,
} from "./redis.js";

async function processBuild(job: Job<{ buildId: string }>): Promise<void> {
  const { buildId } = job.data;
  const input = await getBuildInput(buildId);
  if (!input)
    throw new UnrecoverableError(`Build ${buildId} expired or does not exist.`);

  const graph = await getResumeWorkflowGraph();
  try {
    if (job.name === "start") {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!user)
        throw new UnrecoverableError("The build owner no longer exists.");
      const profile = await getExportedProfile(user);
      await graph.invoke(
        {
          workflowVersion: input.workflowVersion,
          buildId,
          userId: input.userId,
          jobPost: input.jobPost,
          templateId: input.templateId,
          profile,
          draft: {},
          review: null,
          acceptedDecisions: [],
          round: 1,
          resumeId: null,
        },
        workflowConfig(buildId),
      );
      return;
    }

    if (job.name === "resume") {
      const resumeInput =
        await getResumeCommand<ResumeWorkflowResumeInput>(buildId);
      if (!resumeInput)
        throw new UnrecoverableError("The feedback command expired.");

      // human_review is a synchronous node wrapped around LangGraph's
      // interrupt(), so it cannot publish its own exit. publishReviewNode
      // opened its span; this resume job arriving IS the moment the human
      // finished, so close it here.
      const projection = await getReviewProjection(buildId);
      await publishBuildEvent(buildId, {
        type: "node_end",
        data: {
          node: "human_review",
          round: projection?.round ?? 1,
          at: Date.now(),
          accepted: resumeInput.decisions.filter(
            (decision) => decision.decision === "accept",
          ).length,
        },
      });

      await graph.invoke(
        new Command({ resume: resumeInput }),
        workflowConfig(buildId),
      );
      return;
    }

    throw new UnrecoverableError(`Unknown resume workflow job: ${job.name}`);
  } catch (error) {
    // A blocked URL is an input problem, not a transient model/worker failure.
    // Publish the paste fallback once and complete this queue job successfully
    // so BullMQ does not spend two more AI calls retrying the same URL.
    if (error instanceof JobPostUnreadableError) {
      await patchBuildMetadata(buildId, {
        status: "error",
        errorCode: "job_post_unreadable",
      });
      await publishBuildEvent(buildId, {
        type: "job_post_unreadable",
        data: {
          message:
            "We could not read that job posting. Paste its text and we will tailor from that instead.",
          url: input.jobPost.kind === "url" ? input.jobPost.url : "",
          templateId: input.templateId,
        },
      });
      return;
    }
    throw error;
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof AiModelUnavailableError) {
    return "The AI model is temporarily unavailable after repeated attempts.";
  }
  return "Unable to build the resume right now.";
}

const concurrency = Math.max(
  1,
  Number.parseInt(process.env.RESUME_WORKER_CONCURRENCY ?? "2", 10) || 2,
);
const worker = new Worker(RESUME_BUILD_QUEUE, processBuild, {
  connection: { url: REDIS_URL },
  concurrency,
});

worker.on("failed", (job, error) => {
  if (!job) return;
  const buildId = job.data.buildId;

  const attempts = job.opts.attempts ?? 1;
  const willRetry =
    !(error instanceof UnrecoverableError) && job.attemptsMade < attempts;

  // friendlyError() collapses every non-model failure into one vague sentence
  // for the browser. Log the real cause here, or it survives only inside the
  // BullMQ job hash in Redis.
  console.error(
    `[resume-worker ${buildId}] job "${job.name}" failed on attempt ` +
      `${job.attemptsMade}/${attempts} (${willRetry ? "retrying" : "giving up"})`,
    error,
  );

  if (willRetry) return;
  const message = friendlyError(error);
  void patchBuildMetadata(buildId, {
    status: "error",
    errorCode: "build_failed",
    errorMessage: message,
  })
    .then(() =>
      publishBuildEvent(buildId, {
        type: "build_error",
        data: { message, canRegenerate: true },
      }),
    )
    .catch((publishError) =>
      console.error(
        `[resume-worker ${buildId}] could not publish terminal failure`,
        publishError,
      ),
    );
});

worker.on("error", (error) => console.error("[resume-worker]", error));
console.log(`[resume-worker] listening with concurrency ${concurrency}`);

async function shutdown(): Promise<void> {
  await worker.close();
  await prisma.$disconnect();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
