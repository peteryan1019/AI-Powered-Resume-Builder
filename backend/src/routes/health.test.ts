import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createHealthRouter } from "./health.js";

function appWith(checkDatabase: () => Promise<boolean>) {
  const app = express();
  app.use("/api/health", createHealthRouter({ checkDatabase, uptime: () => 42.7 }));
  return app;
}

function appWithRedis(checkRedis: () => Promise<boolean>) {
  const app = express();
  app.use(
    "/api/health",
    createHealthRouter({ checkDatabase: async () => true, checkRedis, uptime: () => 42.7 }),
  );
  return app;
}

describe("GET /api/health (liveness)", () => {
  it("reports ok while the process is running", async () => {
    const res = await request(appWith(async () => true)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.uptime).toBe(43);
    expect(Date.parse(res.body.timestamp)).not.toBeNaN();
  });

  it("stays ok even when the database is down", async () => {
    // Liveness must not depend on the database, or a recoverable outage would
    // make the orchestrator kill and restart a perfectly healthy container.
    const res = await request(appWith(async () => false)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("GET /api/health/ready (readiness)", () => {
  it("reports ready when the database answers", async () => {
    const res = await request(appWith(async () => true)).get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", database: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const res = await request(appWith(async () => false)).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not-ready", database: "down" });
  });

  it("returns 503 rather than crashing when the check throws", async () => {
    const res = await request(
      appWith(async () => {
        throw new Error("connection refused");
      }),
    ).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.database).toBe("down");
  });

  it("returns 503 when Redis cannot serve sessions and queued builds", async () => {
    const res = await request(appWithRedis(async () => false)).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not-ready", database: "up", redis: "down" });
  });

  it("becomes unready immediately when graceful shutdown begins", async () => {
    const app = express();
    app.use(
      "/api/health",
      createHealthRouter({
        checkDatabase: async () => true,
        checkRedis: async () => true,
        isShuttingDown: () => true,
      }),
    );
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: "not-ready",
      reason: "shutting-down",
    });
  });
});
