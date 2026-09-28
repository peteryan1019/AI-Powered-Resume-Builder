import { Router, type Request, type Response } from "express";

/**
 * Liveness and readiness endpoints.
 *
 * Mounted under /api so it reaches the backend through the frontend's nginx,
 * which only proxies /api/, /auth/ and /webhooks/ — a route at the bare /health
 * would be swallowed by the SPA catch-all and never arrive here.
 *
 * The database check is injected rather than importing prisma directly, so the
 * routes can be tested without a live database.
 */
export interface HealthDeps {
  /** Resolves true when the database answers a trivial query. */
  checkDatabase: () => Promise<boolean>;
  /** Redis backs authentication sessions, queues, and active build state. */
  checkRedis?: () => Promise<boolean>;
  /** Seconds the process has been running. Injectable to keep tests stable. */
  uptime?: () => number;
  /** True after shutdown begins, so load balancers stop sending new work. */
  isShuttingDown?: () => boolean;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  const uptime = deps.uptime ?? (() => process.uptime());
  const isShuttingDown = deps.isShuttingDown ?? (() => false);

  // Liveness: is the process up and serving? Deliberately depends on nothing
  // else, so a database outage never causes the container to be killed and
  // restarted — that would turn a recoverable outage into a restart loop.
  router.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: Math.round(uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness: can this instance actually serve requests? Reports 503 when the
  // database or Redis is unreachable so a proxy can stop sending it traffic.
  router.get("/ready", async (_req: Request, res: Response) => {
    if (isShuttingDown()) {
      res.status(503).json({
        status: "not-ready",
        reason: "shutting-down",
        database: "unknown",
        redis: "unknown",
      });
      return;
    }

    let database = false;
    let redis = false;
    const [databaseResult, redisResult] = await Promise.allSettled([
      deps.checkDatabase(),
      deps.checkRedis?.() ?? Promise.resolve(true),
    ]);
    if (databaseResult.status === "fulfilled") database = databaseResult.value;
    if (redisResult.status === "fulfilled") redis = redisResult.value;

    const ready = database && redis;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not-ready",
      database: database ? "up" : "down",
      redis: redis ? "up" : "down",
    });
  });

  return router;
}
