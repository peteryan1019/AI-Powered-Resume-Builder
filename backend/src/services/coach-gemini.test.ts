import { describe, expect, it } from "vitest";
import { COACH_RUBRIC } from "./coachRubric.js";

describe("resume coach rubric", () => {
  it("has stable criteria that total 100 points", () => {
    expect(COACH_RUBRIC.reduce((sum, item) => sum + item.maxScore, 0)).toBe(100);
    expect(new Set(COACH_RUBRIC.map((item) => item.key)).size).toBe(COACH_RUBRIC.length);
  });
});
