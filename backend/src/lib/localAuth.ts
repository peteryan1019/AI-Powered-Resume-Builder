import crypto from 'node:crypto';

import prisma from './prisma.js';

const CODE_DIGITS = 6;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before a code is burned

export class LocalAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'LocalAuthError';
  }
}

type UserRecord = {
  id: string;
  email: string;
  googleid: string | null;
  name: string | null;
  avatarUrl: string | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  // Deliberately loose — real validation is "can we deliver a code to it".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Cryptographically-random zero-padded numeric code, e.g. "042317". */
export function generateCode(): string {
  const max = 10 ** CODE_DIGITS;
  return crypto.randomInt(0, max).toString().padStart(CODE_DIGITS, '0');
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** Constant-time compare of two hex digests of equal length. */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Start a passwordless login: mint a one-time code for the email and return it
 * so the caller can send it. Any syntactically-valid email is accepted — the
 * account is only created later, on the first successful code verification — so
 * the response never reveals whether the address is already registered.
 *
 * Returns the raw code exactly once (it is stored only as a hash).
 */
export async function requestLoginCode(input: { email: string }): Promise<{ email: string; code: string }> {
  const email = normalizeEmail(input.email ?? '');

  if (!email || !isEmail(email)) {
    throw new LocalAuthError('A valid email is required.', 400, 'invalid_email');
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // One active code per email; re-requesting overwrites and resets attempts.
  await prisma.emailLoginCode.upsert({
    where: { email },
    create: { email, codeHash: hashCode(code), expiresAt, attempts: 0 },
    update: { codeHash: hashCode(code), expiresAt, attempts: 0 },
  });

  return { email, code };
}

/**
 * Complete a passwordless login. Validates the code (existence, expiry, attempt
 * cap, constant-time match), then creates the account on first use or returns
 * the existing one. The email address is the identity, so this converges with
 * the Google OAuth account for the same address.
 */
export async function verifyLoginCode(input: { email: string; code: string }): Promise<UserRecord> {
  const email = normalizeEmail(input.email ?? '');
  const code = typeof input.code === 'string' ? input.code.trim() : '';

  if (!email || !code) {
    throw new LocalAuthError('Email and code are required.', 400, 'missing_fields');
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!EMAIL_PATTERN.test(email)) {
    throw new LocalAuthError("Please enter a valid email address.", 400, "invalid_email");
  }

  const record = await prisma.emailLoginCode.findUnique({ where: { email } });

  const invalid = () => new LocalAuthError('Invalid or expired code.', 400, 'invalid_code');

  if (!record) {
    throw invalid();
  }

  // Expired or too many wrong guesses → burn it and reject.
  if (record.expiresAt.getTime() < Date.now() || record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailLoginCode.delete({ where: { email } }).catch(() => {});
    throw invalid();
  }

  if (!hashesEqual(hashCode(code), record.codeHash)) {
    await prisma.emailLoginCode.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    throw invalid();
  }

  // Correct code — consume it and resolve the account (create on first use).
  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email } });

  const invalid = () => new LocalAuthError('Invalid or expired code.', 400, 'invalid_code');

  if (!record) {
    throw invalid();
  }

  // Expired or too many wrong guesses → burn it and reject.
  if (record.expiresAt.getTime() < Date.now() || record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailLoginCode.delete({ where: { email } }).catch(() => {});
    throw invalid();
  }

  if (!hashesEqual(hashCode(code), record.codeHash)) {
    await prisma.emailLoginCode.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    throw invalid();
  }

  // Correct code — consume it and resolve the account (create on first use).
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    await tx.emailLoginCode.delete({ where: { email } });
    return user;
  });
}
