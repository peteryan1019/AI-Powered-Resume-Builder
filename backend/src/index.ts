import express from 'express';
import session from "express-session";
import dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import cors from 'cors';
import userRouter from './routes/user_routes.ts';
import authSession from "./auth/session.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { LocalAuthError, loginLocalUser, signupLocalUser } from './lib/localAuth.js';

import profileRouter from './routes/profile_routes.ts';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const app = express();
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;


app.use(cors({ origin: 'http://localhost:4200', credentials: true}));
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

app.get(
  "/auth/google",
  authSession.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/callback",
  authSession.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth`,
  }),
  (_req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/tailor`);
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

app.use('/api/profile', requireAuth, profileRouter);

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
