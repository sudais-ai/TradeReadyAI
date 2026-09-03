-- Phase 12: composite index on TradeCase(userId, updatedAt DESC) to
-- support the dashboard "recent trade cases" query without a sort step.
-- The single-column TradeCase_userId_idx is preserved for ownership
-- lookups that don't need the sort.
--
-- This migration is additive only — no existing data is touched.

-- CreateIndex
CREATE INDEX "TradeCase_userId_updatedAt_idx" ON "TradeCase"("userId" DESC, "updatedAt" DESC);
