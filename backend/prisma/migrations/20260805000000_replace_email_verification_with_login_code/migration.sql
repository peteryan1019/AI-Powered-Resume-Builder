-- Local auth moved from password + email-verification to passwordless email OTP.
-- Drop the (possibly-never-applied) verification-token table and create the
-- one-time login-code table. LocalAuthCredential is intentionally left in place.

-- DropTable
DROP TABLE IF EXISTS "EmailVerificationToken";

-- CreateTable
CREATE TABLE "EmailLoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLoginCode_email_key" ON "EmailLoginCode"("email");
