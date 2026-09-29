import type Stripe from "stripe";
import { SubscriptionStatus } from "../../generated/prisma/client.js";
import prisma from "../lib/prisma.js";

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.PAUSED,
};

const ACCESS_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

export const FREE_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export type SubscriptionAccess = {
  active: boolean;
  status: SubscriptionStatus | "FREE_TRIAL" | "NONE";
  trialEndsAt: string;
};

/**
 * The product trial belongs to the Tailr account, not to Stripe. Deriving its
 * deadline from the immutable account creation time means retries, logouts and
 * starting (or canceling) Checkout can never reset the seven-day clock.
 */
export function getFreeTrialAccess(
  userCreatedAt: Date,
  now: Date = new Date(),
): { active: boolean; trialEndsAt: string } {
  const trialEndsAt = new Date(
    userCreatedAt.getTime() + FREE_TRIAL_DURATION_MS,
  );

  return {
    // The end is exclusive: at the exact deadline, paid access is required.
    active: now.getTime() < trialEndsAt.getTime(),
    trialEndsAt: trialEndsAt.toISOString(),
  };
}

export function stripeStatusGrantsAccess(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing";
}

export async function getSubscriptionAccess(
  user: { id: string; createdAt: Date },
  now: Date = new Date(),
): Promise<SubscriptionAccess> {
  const trial = getFreeTrialAccess(user.createdAt, now);
  const active = await prisma.subscription.findFirst({
    where: { userId: user.id, status: { in: ACCESS_STATUSES } },
    orderBy: { updatedAt: "desc" },
  });
  if (active) {
    return {
      active: true,
      status: active.status,
      trialEndsAt: trial.trialEndsAt,
    };
  }

  if (trial.active) {
    return {
      active: true,
      status: "FREE_TRIAL",
      trialEndsAt: trial.trialEndsAt,
    };
  }

  const latest = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return {
    active: false,
    status: latest?.status ?? "NONE",
    trialEndsAt: trial.trialEndsAt,
  };
}

/**
 * Backfill users who paid before subscription records were introduced. Normal
 * access checks use local webhook-maintained state; Stripe is queried only
 * when the user has no local subscription row yet.
 */
export async function refreshMissingSubscriptionAccess(
  stripe: Stripe,
  user: {
    id: string;
    createdAt: Date;
    stripeCustomerId?: string | null;
  },
): Promise<SubscriptionAccess> {
  const local = await getSubscriptionAccess(user);
  if (
    local.status !== "NONE" ||
    local.active ||
    !user.stripeCustomerId
  ) {
    return local;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: "all",
    limit: 100,
  });
  for (const subscription of subscriptions.data) {
    await syncStripeSubscription(subscription, user.id);
  }
  return getSubscriptionAccess(user);
}

function objectId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Make Stripe's subscription object the source of truth. Upsert makes webhook
 * retries and out-of-order created/updated events safe to process repeatedly.
 */
export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string,
): Promise<{ userId: string; active: boolean } | null> {
  const stripeCustomerId = objectId(subscription.customer);
  if (!stripeCustomerId) return null;

  const [existing, customerOwner] = await Promise.all([
    prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true },
    }),
    prisma.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    }),
  ]);

  const metadataUserId = subscription.metadata?.userId?.trim();
  const userId = customerOwner?.id ?? existing?.userId ?? metadataUserId ?? fallbackUserId;
  if (!userId) return null;

  if (customerOwner && metadataUserId && customerOwner.id !== metadataUserId) {
    throw new Error("Stripe subscription metadata does not match its customer owner.");
  }

  const status = STATUS_MAP[subscription.status]!;
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      userId,
      stripeCustomerId,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  return { userId, active: stripeStatusGrantsAccess(subscription.status) };
}
