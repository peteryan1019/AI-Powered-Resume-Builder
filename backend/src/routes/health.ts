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
  /** Seconds the process has been running. Injectable to keep tests stable. */
  uptime?: () => number;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  const uptime = deps.uptime ?? (() => process.uptime());

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
  // database is unreachable so a proxy can stop sending it traffic.
  router.get("/ready", async (_req: Request, res: Response) => {
    let database = false;
    try {
      database = await deps.checkDatabase();
    } catch {
      database = false;
    }

    res.status(database ? 200 : 503).json({
      status: database ? "ready" : "not-ready",
      database: database ? "up" : "down",
    });
  });

  return router;
}
