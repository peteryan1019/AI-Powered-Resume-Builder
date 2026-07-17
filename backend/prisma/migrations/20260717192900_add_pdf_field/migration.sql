-- AlterTable
ALTER TABLE "Resume" ADD COLUMN     "pdfData" BYTEA,
ALTER COLUMN "content" DROP NOT NULL;
