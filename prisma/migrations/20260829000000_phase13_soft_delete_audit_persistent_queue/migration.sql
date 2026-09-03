-- Phase 13 — Data Safety & Recovery
--
-- Three additive changes (all null-safe, no data loss):
--   1. TradeCase.deletedAt, Document.deletedAt — soft delete columns
--      plus composite indexes that keep the active-records query on
--      a single index seek.
--   2. AuditLog — append-only record of security-relevant mutations.
--      No foreign-key CASCADE on userId: a deleted user keeps their
--      audit log (SetNull keeps the row, just nulls the FK).
--   3. ProcessingJob — durable record of every document-processing
--      request. The in-process Phase 9 queue remains the executor;
--      this table is the source of truth for status, attempts, and
--      recovery after a crash/restart.
--
-- This migration is additive only — no existing data is touched, no
-- columns are removed or renamed, no constraints are tightened.

-- ─── 1. Soft delete columns + indexes ─────────────────────────────────────

-- AlterTable
ALTER TABLE "TradeCase" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Document"  ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
-- Active cases per user (the dashboard query): a single index seek.
CREATE INDEX "TradeCase_userId_deletedAt_idx" ON "TradeCase"("userId", "deletedAt");
-- Active documents per case (the documents list query): single index seek.
CREATE INDEX "Document_tradeCaseId_deletedAt_idx" ON "Document"("tradeCaseId", "deletedAt");

-- ─── 2. AuditLog ──────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "AuditLog" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "userId"    TEXT,
    "action"    TEXT NOT NULL,
    "target"    TEXT NOT NULL,
    "targetId"  TEXT,
    "metadata"  TEXT,
    "ip"        TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_target_targetId_idx"  ON "AuditLog"("target", "targetId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- ─── 3. ProcessingJob ─────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "documentId"   TEXT,
    "tradeCaseId"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "lastError"    TEXT,
    "scheduledFor" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy"     TEXT,
    "lockedAt"     DATETIME,
    "startedAt"    DATETIME,
    "completedAt"  DATETIME,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "ProcessingJob_documentId_fkey"  FOREIGN KEY ("documentId")  REFERENCES "Document"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProcessingJob_tradeCaseId_fkey" FOREIGN KEY ("tradeCaseId") REFERENCES "TradeCase"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProcessingJob_status_scheduledFor_idx" ON "ProcessingJob"("status", "scheduledFor");
CREATE INDEX "ProcessingJob_documentId_idx"          ON "ProcessingJob"("documentId");
CREATE INDEX "ProcessingJob_tradeCaseId_idx"         ON "ProcessingJob"("tradeCaseId");
CREATE INDEX "ProcessingJob_lockedBy_lockedAt_idx"   ON "ProcessingJob"("lockedBy", "lockedAt");
