/**
 * One definition of where Redis lives, shared by everything that talks to it:
 * the resume workflow's state and job queue, and the HTTP session store. Keeping
 * it here stops the connection string and its localhost default from drifting
 * apart between the two.
 */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
