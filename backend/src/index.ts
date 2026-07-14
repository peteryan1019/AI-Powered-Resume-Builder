import express from 'express';
import session from "express-session";
import dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import cors from 'cors';
import userRouter from './routes/user_routes.ts';
import resumeRouter from './routes/resume_routes.ts';
import authSession from "./auth/session.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { LocalAuthError, loginLocalUser, signupLocalUser } from './lib/localAuth.js';

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

app.use(cors({ origin: 'http://localhost:4200', credentials: true}));
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
      secure: false,
    },
  })
);

app.use(authSession.initialize());
app.use(authSession.session());

// Mount the user routes
app.use('/api/users', requireAuth, userRouter);
app.use('/api/users', requireAuth, resumeRouter);

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

app.post('/auth/local/signup', async (req, res, next) => {
  try {
    const user = await signupLocalUser({
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
    });

    req.login(user, (loginError) => {
      if (loginError) {
        next(loginError);
        return;
      }

      res.status(201).json({ user });
    });
  } catch (error) {
    if (error instanceof LocalAuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    next(error);
  }
});

app.post('/auth/local/login', async (req, res, next) => {
  try {
    const user = await loginLocalUser({
      email: req.body?.email,
      password: req.body?.password,
    });

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

app.use('/api/profile', profileRouter);

app.use('/api/payments', requireAuth, paymentRouter);

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
