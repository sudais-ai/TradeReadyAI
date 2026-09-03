/**
 * Phase 12: FTS5 rebuild helper.
 *
 * Drops the FTS5 virtual table and re-populates it from every
 * DocumentChunk row in the database. Used to recover from:
 *   - FTS5 schema drift (after a Prisma migration that changes the
 *     `DocumentChunk.content` shape)
 *   - A bug that left FTS5 out of sync with the source table
 *   - Manual operator intervention
 *
 * IMPORTANT — STOP THE DEV SERVER BEFORE RUNNING THIS.
 * The FTS5 virtual table lives in the same SQLite file as the Prisma
 * tables. If `next dev` (or the Prisma client) is holding a write
 * transaction when we DROP, SQLite will return `SQLITE_LOCKED` and the
 * rebuild will fail.
 *
 * Usage:
 *     npx tsx scripts/rebuild-fts5.mts
 *
 * Idempotent: re-running on a healthy DB ends with
 *     ftsCount() === total DocumentChunk rows
 * which is the post-condition to assert externally.
 */
import { prisma } from "../src/lib/db/prisma";
import {
  ftsDrop,
  ftsCount,
  ftsUpsertMany,
} from "../src/lib/rag/keyword-retriever";
import { log } from "../src/lib/log";

const BATCH_SIZE = 200;

async function main(): Promise<void> {
  const startedAt = Date.now();
  log.info("rebuild-fts5", "start", {});

  // 1. Count the source of truth.
  const totalChunks = await prisma.documentChunk.count();
  log.info("rebuild-fts5", "source count", { totalChunks });
  if (totalChunks === 0) {
    log.warn("rebuild-fts5", "no DocumentChunk rows; nothing to do", {});
  }

  // 2. Drop the FTS table. This wipes any out-of-sync state. The next
  //    ftsUpsertMany will call ensureFtsTable() and recreate it.
  await ftsDrop();
  log.info("rebuild-fts5", "fts table dropped", {});

  // 3. Stream DocumentChunks in batches. We use cursor pagination on
  //    (id) to avoid OFFSET cost on large tables. For our dev target
  //    (single-instance, small DB) the simpler skip/take below is fine
  //    and easier to reason about.
  let cursor: string | undefined;
  let processed = 0;
  while (true) {
    const batch: Array<{ id: string; content: string }> = await prisma.documentChunk.findMany({
      select: { id: true, content: true },
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    await ftsUpsertMany(
      batch.map((c) => ({ chunkId: c.id, content: c.content }))
    );

    processed += batch.length;
    cursor = batch[batch.length - 1].id;
    log.info("rebuild-fts5", "batch upserted", {
      processed,
      batchSize: batch.length,
      pct: totalChunks > 0 ? Math.round((processed / totalChunks) * 100) : 100,
    });

    if (batch.length < BATCH_SIZE) break;
  }

  // 4. Verify.
  const finalCount = await ftsCount();
  const ok = finalCount === totalChunks;
  log.info("rebuild-fts5", "done", {
    processed,
    sourceTotal: totalChunks,
    ftsTotal: finalCount,
    match: ok,
    durationMs: Date.now() - startedAt,
  });

  if (!ok) {
    console.error(
      `[rebuild-fts5] MISMATCH: ftsCount=${finalCount} but documentChunk.count=${totalChunks}`
    );
    process.exit(1);
  }
}

main()
  .catch((err) => {
    log.error("rebuild-fts5", "failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
