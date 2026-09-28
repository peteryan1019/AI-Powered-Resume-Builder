import { Queue, type JobsOptions } from "bullmq";
import { REDIS_URL } from "./redis.js";
import { RESUME_BUILD_QUEUE } from "./constants.js";

const connection = { url: REDIS_URL };
const queue = new Queue(RESUME_BUILD_QUEUE, { connection });

// BullMQ forwards connection failures as an 'error' event. With no listener,
// EventEmitter.emit throws, BullMQ catches it, retries the emit, and finally
// falls back to console.error-ing the raw error object on every reconnect.
// One listener turns that into a single readable line per attempt.
queue.on("error", (error) => console.error("[resume-queue]", error));

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 3 * 24 * 60 * 60, count: 2_000 },
};

export function enqueueBuildStart(buildId: string): Promise<unknown> {
  return queue.add(
    "start",
    { buildId },
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `start-${buildId}`,
    },
  );
}

export function enqueueBuildResume(
  buildId: string,
  reviewId: string,
): Promise<unknown> {
  return queue.add(
    "resume",
    { buildId, reviewId },
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `resume-${buildId}-${reviewId}`,
    },
  );
}

/**
 * Drops a build's queued start job, so deleting a session does not leave a job
 * that will wake up to find its build gone. A job already being worked cannot
 * be removed; the worker handles that itself, failing with UnrecoverableError
 * when the build's input has disappeared.
 */
export async function removeQueuedBuild(buildId: string): Promise<void> {
  try {
    const job = await queue.getJob(`start-${buildId}`);
    await job?.remove();
  } catch {
    // Already gone, or already running. Neither is a problem here.
  }
}

export function closeResumeQueue(): Promise<void> {
  return queue.close();
}
