-- AlterTable
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;
ALTER TABLE "Document" ADD COLUMN "processedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "processingError" TEXT;
ALTER TABLE "Document" ADD COLUMN "processingStatus" TEXT;
