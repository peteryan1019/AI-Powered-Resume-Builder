import { describe, expect, it } from "vitest";
import {
  FREE_TRIAL_DURATION_MS,
  getFreeTrialAccess,
  stripeStatusGrantsAccess,
} from "./subscriptionAccess.js";

describe("Stripe subscription access", () => {
  it.each(["active", "trialing"] as const)("grants access for %s", (status) => {
    expect(stripeStatusGrantsAccess(status)).toBe(true);
  });

  it.each([
    "incomplete",
    "incomplete_expired",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ] as const)("revokes access for %s", (status) => {
    expect(stripeStatusGrantsAccess(status)).toBe(false);
  });
});

describe("account free trial", () => {
  const createdAt = new Date("2026-09-01T12:00:00.000Z");
  const trialEndsAt = new Date(createdAt.getTime() + FREE_TRIAL_DURATION_MS);

  it("grants access throughout the first seven days", () => {
    expect(
      getFreeTrialAccess(createdAt, new Date(trialEndsAt.getTime() - 1)),
    ).toEqual({
      active: true,
      trialEndsAt: "2026-09-08T12:00:00.000Z",
    });
  });

  it("requires payment at the exact seven-day deadline", () => {
    expect(getFreeTrialAccess(createdAt, trialEndsAt)).toEqual({
      active: false,
      trialEndsAt: "2026-09-08T12:00:00.000Z",
    });
  });

  it("does not depend on the server's local timezone", () => {
    const createdWithOffset = new Date("2026-09-01T08:00:00.000-04:00");

    expect(getFreeTrialAccess(createdWithOffset, trialEndsAt).active).toBe(
      false,
    );
  });
});
