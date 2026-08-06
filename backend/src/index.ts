import express from 'express';
import session from "express-session";
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import cors from 'cors';
import userRouter from './routes/user_routes.ts';
import resumeAIRouter1 from './routes/resumeAI1.js';
import authSession from "./auth/session.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { LocalAuthError, requestLoginCode, verifyLoginCode } from './lib/localAuth.js';
import { sendLoginCodeEmail } from './lib/mailer.js';

import profileRouter from './routes/profile_routes.ts';

import paymentRouter, { stripeWebhook } from './routes/payment_routes.js';



dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const app = express();
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;

function safeClientPath(value: unknown): string {
  const path = typeof value === 'string' ? value : '/home';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/home';
}

function safeCheckoutAction(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_:-]{1,80}$/i.test(value) ? value : null;
}

// Trust the reverse proxy (nginx) so secure cookies work behind TLS termination.
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  }),
);
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json());

app.use(
  session({
    secret: process.env.SECRETKEY as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // Send the cookie over HTTPS only in production (behind the TLS proxy).
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use(authSession.initialize());
app.use(authSession.session());

// Brute-force / credential-stuffing protection for local auth (bug #3).
// Per-IP ceiling across all local-auth routes...
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.', code: 'rate_limited' },
});
// Key a limiter by the request's email, falling back to the IP. ipKeyGenerator
// normalizes IPv6 to a /56 subnet so a user's whole block can't rotate
// addresses to bypass the limit (required by express-rate-limit v8).
const byEmailOrIp = (req: express.Request) =>
  typeof req.body?.email === 'string' && req.body.email.trim()
    ? req.body.email.trim().toLowerCase()
    : ipKeyGenerator(req.ip ?? 'unknown');

// Caps how often a code can be requested for one email (anti email-bombing).
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byEmailOrIp,
  message: { error: 'Too many code requests. Please try again later.', code: 'rate_limited' },
});
// Caps wrong-code guesses per email (the attempt counter in the DB is the
// primary defense; this is a coarser second layer). Successful logins don't count.
const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byEmailOrIp,
  message: { error: 'Too many attempts. Please try again later.', code: 'rate_limited' },
});

// Note: express-rate-limit's default in-memory store is per-process and resets
// on restart — fine for a single droplet. Back it with a shared store (Redis /
// connect-pg-simple) if this ever runs on more than one instance.

// Mount the user routes
app.use('/api/users', requireAuth, userRouter);
app.use('/api/users', requireAuth, resumeAIRouter1);

app.get(
  "/auth/google",
  (req, res, next) => {
    const returnTo = safeClientPath(req.query.returnUrl);
    const checkoutAction = safeCheckoutAction(req.query.checkoutAction);

    (req.session as any).returnTo = returnTo;

    if (checkoutAction) {
      (req.session as any).checkoutAction = checkoutAction;
    } else {
      delete (req.session as any).checkoutAction;
    }

    authSession.authenticate("google", {
      scope: ["profile", "email"],
    })(req, res, next);
  }
);

app.get(
  "/auth/google/callback",
  authSession.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth`,
  }),
  (req, res) => {
    const returnTo = safeClientPath((req.session as any).returnTo);
    const checkoutAction = safeCheckoutAction((req.session as any).checkoutAction);

    delete (req.session as any).returnTo;
    delete (req.session as any).checkoutAction;

    if (checkoutAction) {
      const params = new URLSearchParams({ returnTo, checkoutAction });
      res.redirect(`${process.env.FRONTEND_URL}/payment/start?${params.toString()}`);
      return;
    }

    res.redirect(`${process.env.FRONTEND_URL}${returnTo}`);
  }
);

// Passwordless local auth. Step 1: email a one-time code. The response is
// identical for known and unknown emails and does not wait on SMTP, so it never
// reveals whether an address is registered.
app.post('/auth/local/request-code', authIpLimiter, requestCodeLimiter, async (req, res, next) => {
  try {
    const { email, code } = await requestLoginCode({ email: req.body?.email });

    void sendLoginCodeEmail(email, code).catch((err) =>
      console.error('[auth] login-code email failed:', err),
    );

    res.status(202).json({ message: 'If that email is valid, a sign-in code is on its way.' });
  } catch (error) {
    if (error instanceof LocalAuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    next(error);
  }
});

// Step 2: verify the code, then create-or-resolve the account and start a session.
app.post('/auth/local/verify-code', authIpLimiter, verifyCodeLimiter, async (req, res, next) => {
  try {
    const user = await verifyLoginCode({ email: req.body?.email, code: req.body?.code });

    req.login(user, (loginError) => {
      if (loginError) {
        next(loginError);
        return;
      }

      res.json({ user });
    });
  } catch (error) {
    if (error instanceof LocalAuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    next(error);
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ user: null });
  }

  res.json({ user: req.user });
});

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });
});

app.use('/api/profile', requireAuth, profileRouter);

app.use('/api/payments', requireAuth, paymentRouter);

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
