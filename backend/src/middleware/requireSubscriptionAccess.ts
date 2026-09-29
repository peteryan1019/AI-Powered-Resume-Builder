import type { NextFunction, Request, Response } from "express";
import stripe from "../lib/stripeClient.js";
import { refreshMissingSubscriptionAccess } from "../services/subscriptionAccess.js";

/**
 * Enforce paid-feature access at the API boundary. The Angular guard improves
 * navigation, but it is not a security boundary because clients can call an
 * HTTP endpoint without loading the Angular application.
 */
export async function requireSubscriptionAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const access = await refreshMissingSubscriptionAccess(stripe, req.user);
    if (access.active) {
      next();
      return;
    }

    res.status(402).json({
      error: "Your 7-day free trial has ended. Subscribe to continue.",
      code: "subscription_required",
      status: access.status,
      trialEndsAt: access.trialEndsAt,
    });
  } catch (error) {
    next(error);
  }
}
