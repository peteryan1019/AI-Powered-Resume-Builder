import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStepTimer } from "./timing.js";

let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createStepTimer", () => {
  it("logs one line per step plus a total", async () => {
    const timer = createStepTimer("[build abc123]");
    await timer.step("load profile", async () => 1);
    await timer.step("render pdf", async () => 2);
    timer.done();

    expect(logged).toHaveLength(3);
    expect(logged[0]).toContain("[build abc123] load profile");
    expect(logged[1]).toContain("[build abc123] render pdf");
    expect(logged[2]).toContain("TOTAL");
    expect(logged[2]).toContain("load profile");
    expect(logged[2]).toContain("render pdf");
  });

  it("passes the step's return value through untouched", async () => {
    const timer = createStepTimer("[t]");
    const buffer = await timer.step("bytes", async () => Buffer.from("pdf"));
    const object = await timer.step("object", async () => ({ id: "r1" }));
    // pdfData must stay a Buffer for Prisma, so this is load-bearing.
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe("pdf");
    expect(object).toEqual({ id: "r1" });
  });

  it("marks a failing step and re-throws to the caller", async () => {
    const timer = createStepTimer("[t]");
    await expect(
      timer.step("ai review", async () => {
        throw new Error("model unavailable");
      }),
    ).rejects.toThrow("model unavailable");

    expect(logged[0]).toContain("ai review");
    expect(logged[0]).toContain("FAILED");
  });

  it("still reports a total after a failure", async () => {
    const timer = createStepTimer("[t]");
    try {
      await timer.step("boom", async () => {
        throw new Error("nope");
      });
    } catch {
      // the pipeline calls done() from a finally block
    }
    timer.done();
    expect(logged.at(-1)).toContain("TOTAL");
    expect(logged.at(-1)).toContain("failed");
  });

  it("formats sub-second durations in ms and longer ones in seconds", async () => {
    const timer = createStepTimer("[t]");
    await timer.step("quick", async () => null);
    expect(logged[0]).toMatch(/\d+ms$/);

    await timer.step("slow", async () => {
      await new Promise((r) => setTimeout(r, 1050));
    });
    expect(logged[1]).toMatch(/\d+\.\d{2}s$/);
  });

  it("reports a total with no steps", () => {
    const timer = createStepTimer("[t]");
    timer.done();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("TOTAL");
  });
});
