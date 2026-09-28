import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createWorkerHealthRouter } from "./workerHealth.js";

function appWith(
  overrides: Partial<Parameters<typeof createWorkerHealthRouter>[0]> = {},
) {
  const app = express();
  app.use(
    createWorkerHealthRouter({
      checkDatabase: async () => true,
      checkRedis: async () => true,
      isWorkerRunning: () => true,
      isShuttingDown: () => false,
      uptime: () => 12.6,
      ...overrides,
    }),
  );
  return app;
}

describe("resume-worker health", () => {
  it("keeps liveness independent from Redis and PostgreSQL", async () => {
    const res = await request(
      appWith({
        checkDatabase: async () => false,
        checkRedis: async () => false,
      }),
    ).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", uptime: 13 });
  });

  it("reports ready only when the worker and both dependencies are ready", async () => {
    const res = await request(appWith()).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ready",
      worker: "running",
      database: "up",
      redis: "up",
    });
  });

  it("reports dependency failures without throwing", async () => {
    const res = await request(
      appWith({
        checkRedis: async () => {
          throw new Error("connection refused");
        },
      }),
    ).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.redis).toBe("down");
  });

  it("becomes unready while a graceful shutdown drains an active job", async () => {
    const res = await request(
      appWith({ isShuttingDown: () => true }),
    ).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.worker).toBe("shutting-down");
  });
});
