import { Router, type Request, type Response } from "express";

export interface WorkerHealthDeps {
  checkDatabase: () => Promise<boolean>;
  checkRedis: () => Promise<boolean>;
  isWorkerRunning: () => boolean;
  isShuttingDown: () => boolean;
  uptime?: () => number;
}

/**
 * Workers do not receive user traffic, but Kubernetes still needs two distinct
 * answers: liveness asks whether this Node process is alive, while readiness
 * asks whether it is currently safe for the process to consume queue jobs.
 */
export function createWorkerHealthRouter(deps: WorkerHealthDeps): Router {
  const router = Router();
  const uptime = deps.uptime ?? (() => process.uptime());

  router.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: Math.round(uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/health/ready", async (_req: Request, res: Response) => {
    const shuttingDown = deps.isShuttingDown();
    const worker = !shuttingDown && deps.isWorkerRunning();
    const [databaseResult, redisResult] = await Promise.allSettled([
      deps.checkDatabase(),
      deps.checkRedis(),
    ]);
    const database =
      databaseResult.status === "fulfilled" && databaseResult.value;
    const redis = redisResult.status === "fulfilled" && redisResult.value;
    const ready = worker && database && redis;

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not-ready",
      worker: worker ? "running" : shuttingDown ? "shutting-down" : "stopped",
      database: database ? "up" : "down",
      redis: redis ? "up" : "down",
    });
  });

  return router;
}
