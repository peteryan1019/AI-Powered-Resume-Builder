import { Queue, type JobsOptions } from "bullmq";
import { REDIS_URL } from "./redis.js";

export const RESUME_BUILD_QUEUE = "resume-builds-v1";

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

export function closeResumeQueue(): Promise<void> {
  return queue.close();
}
