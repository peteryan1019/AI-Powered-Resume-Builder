/**
 * Queue names are connection-free constants. Keeping this outside queue.ts is
 * important for the worker: importing the producer module would otherwise
 * create a second, unused BullMQ Redis connection in every worker process.
 */
export const RESUME_BUILD_QUEUE = "resume-builds-v1";
