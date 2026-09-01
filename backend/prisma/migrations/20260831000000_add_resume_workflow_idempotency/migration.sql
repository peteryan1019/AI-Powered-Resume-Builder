-- A finalizer may be retried after writing to PostgreSQL but before its queue
-- acknowledgement. These keys make the durable side effects idempotent.
ALTER TABLE "Resume" ADD COLUMN "buildId" TEXT;
CREATE UNIQUE INDEX "Resume_buildId_key" ON "Resume"("buildId");

ALTER TABLE "ProfileInstance" ADD COLUMN "sourceBuildKey" TEXT;
CREATE UNIQUE INDEX "ProfileInstance_sourceBuildKey_key" ON "ProfileInstance"("sourceBuildKey");
