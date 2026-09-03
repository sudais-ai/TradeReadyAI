-- AlterTable
ALTER TABLE "Document" ADD COLUMN "embeddedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "embeddingError" TEXT;
ALTER TABLE "Document" ADD COLUMN "embeddingStatus" TEXT;

-- CreateTable
CREATE TABLE "DocumentChunkEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chunkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunkEmbedding_chunkId_provider_model_key" ON "DocumentChunkEmbedding"("chunkId", "provider", "model");
