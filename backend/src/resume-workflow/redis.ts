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

export async function checkWorkflowRedis(): Promise<boolean> {
  return (await redis.ping()) === "PONG";
}

export async function closeWorkflowRedis(): Promise<void> {
  if (redis.status === "end") return;
  if (redis.status !== "ready") {
    redis.disconnect();
    return;
  }
  await redis.quit();
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

/**
 * Every build a user has started, newest first. Builds are otherwise reachable
 * only by their own id, so losing the page URL lost the build -- including one
 * paused waiting for feedback. Scored by creation time and expiring with the
 * same TTL as the builds themselves: an index outliving the state it points at
 * would list sessions that cannot be resumed.
 */
export function userBuildsKey(userId: string): string {
  return `resume:user:${userId}:builds`;
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
    .zadd(
      userBuildsKey(input.userId),
      new Date(input.createdAt).getTime(),
      input.buildId,
    )
    .expire(userBuildsKey(input.userId), WORKFLOW_TTL_SECONDS)
    .exec();
}

/**
 * Everything one build owns in Redis, so deleting a session leaves nothing
 * behind. Beyond the five `resume:build:*` keys, LangGraph's checkpointer keeps
 * roughly fifty more per build across four key families -- the graph state that
 * lets a paused build resume. All of them are addressed `<prefix>:<buildId>::…`,
 * which is what makes them findable.
 *
 * This deliberately does NOT touch the Resume row a finished build produced.
 * Discarding a build is not the same as throwing away the resume it wrote, and
 * that resume is reachable from My resumes independently of any of this.
 */
export async function deleteBuild(
  userId: string,
  buildId: string,
): Promise<number> {
  let removed = 0;
  for (const prefix of [
    "checkpoint",
    "checkpoint_blob",
    "checkpoint_write",
    "write_keys_zset",
  ]) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}:${buildId}::*`,
        "COUNT",
        200,
      );
      cursor = next;
      if (keys.length) removed += await redis.del(...keys);
    } while (cursor !== "0");
  }

  removed += await redis.del(
    buildMetaKey(buildId),
    buildInputKey(buildId),
    buildReviewKey(buildId),
    buildResumeCommandKey(buildId),
    buildEventsKey(buildId),
  );
  await redis.zrem(userBuildsKey(userId), buildId);
  return removed;
}

/**
 * Adds builds that predate the index, once per user.
 *
 * The index is written when a build is created, so builds that already existed
 * when it shipped are absent -- including ones paused waiting for feedback,
 * which are exactly the ones worth recovering. A marker key records that the
 * scan has run so it happens once rather than on every read.
 *
 * This is a migration shim. Once no build older than WORKFLOW_TTL_SECONDS can
 * still be alive, nothing it finds will exist and it can be deleted.
 */
async function backfillUserBuilds(userId: string, key: string): Promise<void> {
  const marker = `${key}:backfilled`;
  if (await redis.exists(marker)) return;

  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "resume:build:*:meta",
      "COUNT",
      200,
    );
    cursor = next;
    for (const metaKey of keys) {
      const raw = await redis.get(metaKey);
      if (!raw) continue;
      const metadata = JSON.parse(raw) as BuildMetadata;
      if (metadata.userId !== userId) continue;
      await redis.zadd(
        key,
        "NX",
        new Date(metadata.createdAt).getTime(),
        metadata.buildId,
      );
    }
  } while (cursor !== "0");

  await redis.expire(key, WORKFLOW_TTL_SECONDS);
  await redis.set(marker, "1", "EX", WORKFLOW_TTL_SECONDS);
}

/**
 * A user's builds, newest first, with ids whose state has expired pruned from
 * the index as they are found. Self-healing beats a cleanup job: the only time
 * anyone cares about a dead id is when reading the list.
 */
export async function listUserBuilds(
  userId: string,
  limit = 40,
): Promise<BuildMetadata[]> {
  const key = userBuildsKey(userId);
  await backfillUserBuilds(userId, key);
  const ids = await redis.zrevrange(key, 0, limit - 1);
  const alive: BuildMetadata[] = [];
  const expired: string[] = [];
  for (const id of ids) {
    const metadata = await getBuildMetadata(id);
    if (metadata) alive.push(metadata);
    else expired.push(id);
  }
  if (expired.length) await redis.zrem(key, ...expired);
  return alive;
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
