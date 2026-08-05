# Local Auth Hardening — Design Proposal

> **Status: SUPERSEDED by passwordless email-OTP.** The password + email-verification design below
> was implemented, then replaced: a Google user could never obtain a local password, which broke the
> "sign in locally to an account first made via Google" case. Local auth is now **passwordless email
> OTP** (`requestLoginCode` / `verifyLoginCode` in `src/lib/localAuth.ts`, `EmailLoginCode` model),
> which resolves all four original bugs *and* the Google-account convergence problem — the email
> address is the identity, so there are no passwords to store, hijack, or link. Google OAuth is
> unchanged. The sections below are kept as design history; the OTP flow is the live implementation.

Scope: the top-severity findings in the local-auth review.

| # | Severity | Issue | Fix summary |
|---|----------|-------|-------------|
| 1 | Critical | Signup attaches a password to any pre-existing (OAuth) account → account takeover | Public signup never mutates an existing user; password-linking moves to an authenticated endpoint |
| 2 | High | `pbkdf2Sync` on the login path blocks the event loop → DoS | Make `verifyPassword` async (`crypto.pbkdf2`) |
| 4 | High | Login timing distinguishes "user exists" from "not found" → user enumeration | Always run one constant-cost hash comparison, even when no user/credential |
| 3 | High | No brute-force protection on login | `express-rate-limit` on the local auth routes (IP + per-email) |

No Prisma migration is required for #1/#2/#4. `googleid` already distinguishes OAuth accounts; `#3` adds a dependency only.

---

## 1. Account takeover via signup  (Critical)

### Root cause
`signupLocalUser` has a "link to existing user" branch: if a `User` row exists but has no
`LocalAuthCredential`, it creates one from the request body. Google users are created with **no**
credential (`session.ts` upsert), so anyone can POST their email + an attacker password and seize
the account. There is no proof of email ownership at any point.

### Design principle
> Public signup may only ever **create a brand-new user**. It must never write a credential onto a
> user row it did not just create. Linking a password to an existing identity is an *authenticated*
> action.

### Changes

**a. `signupLocalUser` — remove the linking branch.**

```ts
return prisma.$transaction(async (tx) => {
  const existingUser = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    // Do NOT attach a credential to a pre-existing account (OAuth or otherwise).
    throw new LocalAuthError('An account already exists for this email.', 409, 'email_exists');
  }
  const user = await tx.user.create({ data: { email, name } });
  await createCredential(tx, user.id, passwordHash);
  return user;
});
```

This alone closes the takeover.

**b. New authenticated endpoint: set/change local password.**

`POST /auth/local/password` behind `requireAuth`. This is the *safe* place a Google-only user adds a
password, because the session already proves they own the account.

```ts
app.post('/auth/local/password', requireAuth, async (req, res, next) => {
  const userId = (req.user as any).id;
  await setLocalPassword({ userId, currentPassword: req.body?.currentPassword,
                           newPassword: req.body?.newPassword });
  res.json({ ok: true });
});
```

`setLocalPassword` logic:
- If a credential already exists → require `currentPassword` and verify it (prevents session-riding
  password change).
- If none exists (first-time link for an OAuth user) → session auth alone is sufficient; create it.

### Residual risk & the "full" alternative
Signup still reveals that an email is registered (the `409`). Fully removing that requires an
**email-verification flow**: signup always returns a neutral "check your email" response and only
provisions the credential after the user clicks a tokened link — an existing account instead gets a
"you already have an account" email. That needs SMTP/token infrastructure. Recommendation: ship (a)+(b)
now (zero new infra, closes takeover), treat email verification as a follow-up if account-existence
disclosure matters for the threat model.

---

## 2. Blocking `pbkdf2Sync` → DoS  (High)

### Root cause
`verifyPassword` uses `crypto.pbkdf2Sync` (120k SHA-512 iterations). It blocks the single Node event
loop for the full computation, so concurrent logins serialize and stall *all* traffic. Signup already
uses the async `crypto.pbkdf2`; login is inconsistent.

### Change
Make `verifyPassword` return `Promise<boolean>` using the async API (libuv threadpool → no event-loop
block). `loginLocalUser` is already `async`, so only the `await` is added.

```ts
import { promisify } from 'node:util';
const pbkdf2 = promisify(crypto.pbkdf2);

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationsText, saltHex, hashHex] = storedHash.split('$');
  if (scheme !== 'pbkdf2' || !iterationsText || !saltHex || !hashHex) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;   // hardened parse
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await pbkdf2(password, salt, iterations, expected.length, HASH_ALGORITHM);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
```

Note: default threadpool is 4 (`UV_THREADPOOL_SIZE`); combined with rate-limiting (#3) this bounds
concurrent hashing cost.

### Optional upgrade (not required)
The stored format is already versioned (`pbkdf2$…`). If you want a stronger KDF, add a `scrypt$…` /
`argon2$…` branch to `verifyPassword`, hash new passwords with it, and transparently re-hash on next
successful login. Keep pbkdf2 verification for existing rows. Out of scope for this pass.

---

## 4. Timing-based user enumeration  (High)

### Root cause
On "user not found" (or "no credential"), login returns immediately with no hashing; on a real user it
runs an expensive PBKDF2. The time delta enumerates valid accounts.

### Change
Always perform exactly one constant-cost verification, comparing against a precomputed dummy hash when
there is no real one. Single generic `401` on every failure path.

```ts
// Precomputed ONCE at module load, same algo/iterations as real hashes.
const DUMMY_HASH = buildDummyHash(); // returns a valid `pbkdf2$120000$<salt>$<key>` string

export async function loginLocalUser({ email, password }) {
  const normEmail = normalizeEmail(email);
  const pwd = password.trim();
  if (!normEmail || !pwd) throw new LocalAuthError('Email and password are required.', 400, 'missing_fields');

  const user = await prisma.user.findUnique({ where: { email: normEmail } });
  const storedHash = user ? await readCredentialHash(prisma, user.id) : null;

  // Runs even when user/credential is missing → constant time.
  const ok = await verifyPassword(pwd, storedHash ?? DUMMY_HASH);

  if (!user || !storedHash || !ok) {
    throw new LocalAuthError('Invalid email or password.', 401, 'invalid_credentials');
  }
  return user;
}
```

The dummy hash must use the current default iteration count so its cost matches real verifications.

---

## 3. Brute-force protection  (High)

### Change
Add `express-rate-limit` and apply a limiter to the local auth routes. Two complementary limits:

- **Per-IP**, on all `/auth/local/*`: e.g. 20 requests / 15 min — blunt DoS/stuffing ceiling.
- **Per-email**, on `/auth/local/login`: e.g. 5–10 failed attempts / 15 min, keyed by
  `normalizeEmail(req.body.email)` — targets password-guessing against one account. Count failures
  only (use `skipSuccessfulRequests`).

```ts
import rateLimit from 'express-rate-limit';

const ipLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 20,
  standardHeaders: true, legacyHeaders: false,
});
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 8, skipSuccessfulRequests: true,
  keyGenerator: (req) => normalizeEmail(req.body?.email ?? ''),
});

app.post('/auth/local/login',  ipLimiter, loginEmailLimiter, /* handler */);
app.post('/auth/local/signup', ipLimiter, /* handler */);
```

`app.set('trust proxy', 1)` is already set (index.ts:39), so the client IP is read correctly behind
nginx.

### Store caveat
Default store is in-memory: fine for a single droplet, but resets on restart and isn't shared across
instances. If/when you scale out (or fix the session `MemoryStore`, finding #5), back both with the
same Postgres/Redis store. Acceptable to launch in-memory.

---

## Rollout

1. `npm i express-rate-limit` (only new dependency).
2. Edit `backend/src/lib/localAuth.ts`: async `verifyPassword`, dummy-hash login, drop the signup
   linking branch, add `setLocalPassword`.
3. Edit `backend/src/index.ts`: mount limiters; add `POST /auth/local/password` (requireAuth).
4. Tests (vitest is already set up): (a) signup on an existing OAuth email is rejected and does **not**
   create a credential; (b) login rejects unknown email and wrong password with identical status/shape;
   (c) rate limiter returns 429 after threshold; (d) `verifyPassword` returns a Promise.
5. No DB migration.

### Effort
Small — one library, ~2 files, no schema change. #1, #2, #4 are all localized to `localAuth.ts`.
