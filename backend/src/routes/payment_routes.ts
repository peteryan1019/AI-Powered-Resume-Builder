import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import prisma from "../lib/prisma.js";
import stripe from "../lib/stripeClient.js";
import {
  refreshMissingSubscriptionAccess,
  syncStripeSubscription,
} from "../services/subscriptionAccess.js";

const router = Router();

function safeReturnTo(value: unknown): string {
  const path = typeof value === "string" ? value : "/tailor";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/tailor";
}

function safeAction(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value)
    ? value
    : "paid_action";
}

router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const action = safeAction(req.body?.action);
    const returnTo = safeReturnTo(req.body?.returnTo);

    const access = await refreshMissingSubscriptionAccess(stripe, user);
    if (access.active) {
      return res.json({ alreadyPaid: true, returnTo });
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });

      customerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { userId: user.id, action, returnTo },
      subscription_data: {
        metadata: { userId: user.id, action, returnTo },
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}${returnTo}?payment=cancelled`,
    });

    await prisma.payment.create({
      data: {
        userId: user.id,
        action,
        returnTo,
        stripeCheckoutSessionId: session.id,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout failed:", error);

    const message =
      error instanceof Error ? error.message : "Unable to start checkout";

    return res.status(400).json({ error: message });
  }
});

router.get("/status/:sessionId", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const sessionId = req.params.sessionId;

    if (typeof sessionId !== "string") {
      return res.status(400).json({ error: "Missing checkout session id" });
    }
    const payment = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        stripeCheckoutSessionId: sessionId,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const subscriptionId = objectId(session.subscription);
    let active = false;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      active = (await syncStripeSubscription(subscription, user.id))?.active ?? false;
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: active ? "PAID" : session.status === "expired" ? "CANCELED" : "PENDING",
        stripePaymentIntentId: objectId(session.payment_intent),
        paidAt: active ? (payment.paidAt ?? new Date()) : payment.paidAt,
      },
    });

    return res.json({ paid: active, returnTo: updatedPayment.returnTo });
  } catch (error) {
    logUnknownError("Stripe checkout status failed", error);
    return res.status(502).json({ error: "Unable to verify subscription status" });
  }
});

function objectId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function logUnknownError(label: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(label, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return;
  }

  console.error(label, error);
}

export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (error) {
    logUnknownError("Stripe webhook signature verification failed", error);

    return res.status(400).json({
      error: "Invalid Stripe signature",
    });
  }

  console.log("Stripe webhook verified", {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = await prisma.payment.findUnique({
          where: { stripeCheckoutSessionId: session.id },
          select: { id: true, userId: true, paidAt: true },
        });
        const subscriptionId = objectId(session.subscription);
        const synced = subscriptionId
          ? await syncStripeSubscription(
              await stripe.subscriptions.retrieve(subscriptionId),
              payment?.userId ?? session.client_reference_id ?? undefined,
            )
          : null;

        if (payment) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: synced?.active ? "PAID" : "PENDING",
              stripePaymentIntentId: objectId(session.payment_intent),
              paidAt: synced?.active ? (payment.paidAt ?? new Date()) : payment.paidAt,
            },
          });
        }
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await prisma.payment.updateMany({
          where: { stripeCheckoutSessionId: session.id },
          data: { status: event.type === "checkout.session.expired" ? "CANCELED" : "FAILED" },
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionValue = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = objectId(subscriptionValue ?? null);
        if (subscriptionId) {
          await syncStripeSubscription(await stripe.subscriptions.retrieve(subscriptionId));
        }
        break;
      }

      default:
        console.log("Unhandled Stripe webhook event", {
          eventId: event.id,
          eventType: event.type,
        });
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    logUnknownError("Stripe webhook processing failed after verification", error);

    return res.status(500).json({
      error: "Webhook verified but processing failed",
    });
  }
}

export default router;
