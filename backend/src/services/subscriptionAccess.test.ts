import { describe, expect, it } from "vitest";
import { stripeStatusGrantsAccess } from "./subscriptionAccess.js";

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
