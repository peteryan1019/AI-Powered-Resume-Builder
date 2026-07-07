import crypto from 'node:crypto';

import prisma from './prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

const HASH_ALGORITHM = 'sha512';
const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 64;
const HASH_SALT_BYTES = 16;

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
  createdAt: Date;
  updatedAt: Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(HASH_SALT_BYTES, (saltError, salt) => {
      if (saltError) {
        reject(saltError);
        return;
      }

      crypto.pbkdf2(
        password,
        salt,
        HASH_ITERATIONS,
        HASH_KEY_LENGTH,
        HASH_ALGORITHM,
        (hashError, derivedKey) => {
          if (hashError) {
            reject(hashError);
            return;
          }

          resolve(`pbkdf2$${HASH_ITERATIONS}$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
        },
      );
    });
  });
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, iterationsText, saltHex, hashHex] = storedHash.split('$');

  if (scheme !== 'pbkdf2' || !iterationsText || !saltHex || !hashHex) {
    return false;
  }

  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations)) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, HASH_ALGORITHM);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

type AuthDbClient = typeof prisma | Prisma.TransactionClient;

async function readCredentialHash(db: AuthDbClient, userId: string): Promise<string | null> {
  const credential = await db.localAuthCredential.findUnique({
    where: { userId },
    select: { passwordHash: true },
  });

  return credential?.passwordHash ?? null;
}

async function createCredential(db: AuthDbClient, userId: string, passwordHash: string): Promise<void> {
  await db.localAuthCredential.create({
    data: {
      userId,
      passwordHash,
    },
  });
}

export async function signupLocalUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const password = input.password.trim();
  const name = input.name?.trim() || null;

  if (!email || !password) {
    throw new LocalAuthError('Email and password are required.', 400, 'missing_fields');
  }

  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email } });

    if (existingUser) {
      const existingCredential = await readCredentialHash(tx, existingUser.id);
      if (existingCredential) {
        throw new LocalAuthError('An account already exists for this email.', 409, 'email_exists');
      }

      const user = await tx.user.update({
        where: { email },
        data: {
          name: name ?? existingUser.name,
        },
      });

      await createCredential(tx, user.id, passwordHash);
      return user;
    }

    const user = await tx.user.create({
      data: {
        email,
        name,
      },
    });

    await createCredential(tx, user.id, passwordHash);
    return user;
  });
}

export async function loginLocalUser(input: {
  email: string;
  password: string;
}): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const password = input.password.trim();

  if (!email || !password) {
    throw new LocalAuthError('Email and password are required.', 400, 'missing_fields');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new LocalAuthError('Invalid email or password.', 401, 'invalid_credentials');
  }

  const passwordHash = await readCredentialHash(prisma, user.id);
  if (!passwordHash || !verifyPassword(password, passwordHash)) {
    throw new LocalAuthError('Invalid email or password.', 401, 'invalid_credentials');
  }

  return user;
}
