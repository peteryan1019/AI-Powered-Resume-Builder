import { Redis } from "ioredis";
import { REDIS_URL } from "../lib/redisConfig.js";
import type {
  BuildEvent,
  BuildInput,
  BuildMetadata,
  CoachReview,
  ReviewProjection,
} from "./contracts.js";

export { REDIS_URL } from "../lib/redisConfig.js";
export const WORKFLOW_TTL_SECONDS = 3 * 24 * 60 * 60;
export const EVENT_STREAM_MAX_LENGTH = 200;

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export function getRedis(): Redis {
  return redis;
}

export function buildMetaKey(buildId: string): string {
  return `resume:build:${buildId}:meta`;
}

export function buildInputKey(buildId: string): string {
  return `resume:build:${buildId}:input`;
}

export function buildReviewKey(buildId: string): string {
  return `resume:build:${buildId}:review`;
}

export function buildResumeCommandKey(buildId: string): string {
  return `resume:build:${buildId}:resume-command`;
}

export function buildEventsKey(buildId: string): string {
  return `resume:build:${buildId}:events`;
}

export async function acquireBuildLock(
  buildId: string,
  purpose: string,
): Promise<string | null> {
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;
  const result = await redis.set(
    `resume:build:${buildId}:lock:${purpose}`,
    token,
    "EX",
    30,
    "NX",
  );
  return result === "OK" ? token : null;
}

export async function releaseBuildLock(
  buildId: string,
  purpose: string,
  token: string,
): Promise<void> {
  const key = `resume:build:${buildId}:lock:${purpose}`;
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    key,
    token,
  );
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", WORKFLOW_TTL_SECONDS);
}

async function readJson<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function createBuildRecord(input: BuildInput): Promise<void> {
  const metadata: BuildMetadata = {
    buildId: input.buildId,
    userId: input.userId,
    status: "queued",
    templateId: input.templateId,
    createdAt: input.createdAt,
  };

  await redis
    .multi()
    .set(
      buildInputKey(input.buildId),
      JSON.stringify(input),
      "EX",
      WORKFLOW_TTL_SECONDS,
    )
    .set(
      buildMetaKey(input.buildId),
      JSON.stringify(metadata),
      "EX",
      WORKFLOW_TTL_SECONDS,
    )
    .exec();
}

export function getBuildInput(buildId: string): Promise<BuildInput | null> {
  return readJson<BuildInput>(buildInputKey(buildId));
}

export function getBuildMetadata(
  buildId: string,
): Promise<BuildMetadata | null> {
  return readJson<BuildMetadata>(buildMetaKey(buildId));
}

export async function patchBuildMetadata(
  buildId: string,
  patch: Partial<BuildMetadata>,
): Promise<BuildMetadata> {
  const current = await getBuildMetadata(buildId);
  if (!current) throw new Error(`Build ${buildId} no longer exists.`);
  const next = { ...current, ...patch };
  await writeJson(buildMetaKey(buildId), next);
  return next;
}

export async function putReviewProjection(
  buildId: string,
  review: CoachReview,
): Promise<void> {
  await writeJson(buildReviewKey(buildId), review);
}

export function getReviewProjection(
  buildId: string,
): Promise<ReviewProjection | null> {
  return readJson<ReviewProjection>(buildReviewKey(buildId));
}

export function putResumeCommand(
  buildId: string,
  value: unknown,
): Promise<void> {
  return writeJson(buildResumeCommandKey(buildId), value);
}

export function getResumeCommand<T>(buildId: string): Promise<T | null> {
  return readJson<T>(buildResumeCommandKey(buildId));
}

/**
 * Every event a build ever published, oldest first. The stream is capped at
 * EVENT_STREAM_MAX_LENGTH and expires with WORKFLOW_TTL_SECONDS, so this is a
 * replay of a recent build, not a permanent archive.
 */
export async function readBuildEvents(
  buildId: string,
): Promise<Array<{ id: string; type: string; data: unknown }>> {
  const entries = await redis.xrange(buildEventsKey(buildId), "-", "+");
  return entries.map(([id, fields]) => {
    const values: Record<string, string> = {};
    for (let index = 0; index < fields.length; index += 2) {
      values[fields[index] ?? ""] = fields[index + 1] ?? "";
    }
    return {
      id,
      type: values.type ?? "",
      data: values.data ? JSON.parse(values.data) : {},
    };
  });
}

export async function publishBuildEvent(
  buildId: string,
  event: BuildEvent,
): Promise<string> {
  const key = buildEventsKey(buildId);
  const id = await redis.xadd(
    key,
    "MAXLEN",
    "~",
    EVENT_STREAM_MAX_LENGTH,
    "*",
    "type",
    event.type,
    "data",
    JSON.stringify(event.data),
  );
  await redis.expire(key, WORKFLOW_TTL_SECONDS);
  if (!id) throw new Error("Redis did not return an event stream id.");
  return id;
}
