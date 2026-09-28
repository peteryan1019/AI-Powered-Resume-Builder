import RedisStore from "connect-redis";
import { Redis } from "ioredis";
import type { RedisReply } from "rate-limit-redis";
import { REDIS_URL } from "./redisConfig.js";

/**
 * How long a login lasts. The cookie's max-age and the Redis key's TTL are both
 * set from this, and `rolling` in index.ts refreshes both on every response, so
 * an active user is never signed out mid-session.
 */
export const SESSION_TTL_SECONDS =
  Number.parseInt(process.env.SESSION_TTL_SECONDS ?? "", 10) ||
  7 * 24 * 60 * 60;

/**
 * A connection of its own rather than the resume workflow's client. That one is
 * built with `maxRetriesPerRequest: null` so a queued job survives a long Redis
 * outage; for a web request the opposite is wanted -- fail after a few attempts
 * and return an error rather than leaving the browser hanging.
 */
const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

// ioredis throws when it emits 'error' with no listener attached, which would
// take the whole API process down over a transient Redis blip. Log instead; the
// client reconnects on its own.
client.on("error", (error) => console.error("[session-store]", error));

export async function checkSessionStore(): Promise<boolean> {
  return (await client.ping()) === "PONG";
}

/**
 * express-rate-limit's Redis adapter deliberately accepts a raw-command
 * function rather than depending on one particular Redis client. Reusing the
 * session client keeps one shared source of auth state and avoids opening yet
 * another socket per API Pod.
 */
export async function sendSessionRedisCommand(
  ...command: string[]
): Promise<RedisReply> {
  const [name, ...args] = command;
  if (!name) throw new Error("A Redis command name is required.");
  return (await client.call(name, ...args)) as RedisReply;
}

export async function closeSessionStore(): Promise<void> {
  if (client.status === "end") return;
  if (client.status !== "ready") {
    client.disconnect();
    return;
  }
  await client.quit();
}

/**
 * Session storage backed by Redis instead of express-session's default
 * MemoryStore. MemoryStore keeps sessions in this process's heap, so every
 * deploy or restart threw them away and signed everyone out. Redis outlives the
 * process, so a restart leaves logins intact.
 *
 * connect-redis is pinned to v7: v8+ dropped ioredis support and speaks
 * node-redis' camelCase API (mGet, scanIterator), which ioredis does not have.
 */
export const sessionStore = new RedisStore({
  client,
  prefix: "sess:",
  ttl: SESSION_TTL_SECONDS,
});
