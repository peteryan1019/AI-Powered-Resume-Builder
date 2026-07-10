import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function safeReturnTo(value: unknown): string {
  const path = typeof value === "string" ? value : "/tailor";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/tailor";
}

router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const action = String(req.body?.action ?? "paid_action");
    const returnTo = safeReturnTo(req.body?.returnTo);

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

  if (payment.status !== "PAID") {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          paidAt: new Date(),
        },
      });

      return res.json({
        paid: true,
        returnTo: updatedPayment.returnTo,
      });
    }
  }

  res.json({
    paid: payment.status === "PAID",
    returnTo: payment.returnTo,
  });
});

export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature as string,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return res.status(400).send("Invalid Stripe signature");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === "paid") {
      await prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: {
          status: "PAID",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          paidAt: new Date(),
        },
      });
    }
  }

  res.json({ received: true });
}

export default router;
