/**
 * Phase 14 — POST /api/audit/fts5/rebuild
 *
 * Per-user FTS5 rebuild. Re-indexes only the calling user's
 * DocumentChunk rows. Designed to fix two failure modes:
 *   1. After a soft-delete + restore round-trip, the FTS index
 *      can drift relative to the source table.
 *   2. After a manual SQL edit to the FTS table (the global
 *      `scripts/rebuild-fts5.mts` script is the global recovery
 *      path; this route is the per-user recovery path).
 *
 * Auth model:
 *   - Requires `getCurrentUserId()`. Returns 401 if unauthenticated.
 *   - There is NO admin role. The user can only rebuild their own
 *     chunks. A malicious `?userId=` or `?tradeCaseId=` is ignored.
 *
 * Safety:
 *   - Rate limited to 1 call per user per 5 minutes via the existing
 *     `withRateLimit` helper with a dedicated bucket.
 *   - Same-origin guard (POST) so a malicious cross-origin page
 *     cannot trigger the rebuild.
 *   - The route uses raw SQL via `$executeRawUnsafe` ONLY with
 *     parameterized bindings (the `?` placeholders are bound, not
 *     interpolated). The route never interpolates user input.
 *   - The global FTS5 table is NOT dropped. We delete and re-insert
 *     only the calling user's FTS rows, leaving other users' rows
 *     intact.
 *   - The post-condition is verified by counting the user's FTS
 *     rows before and after. The response reports the user's row
 *     count, the global count, and the global drift.
 *
 * Returns:
 *   200 — { ok: true, userChunkCount, userFtsCount, ftsRowCount, chunkRowCount, drift }
 *   401 — unauthenticated
 *   403 — same-origin blocked
 *   429 — rate limited
 *   500 — internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { ftsCount, ftsDeleteMany, ftsUpsertMany } from "@/lib/rag/keyword-retriever";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REBUILD_WINDOW_MS = 5 * 60 * 1000;
const REBUILD_MAX_PER_WINDOW = 1;
const BATCH_SIZE = 200;

export async function POST(request: NextRequest) {
  const sameOrigin = assertSameOrigin(request);
  if (sameOrigin) return sameOrigin;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit by user id, not by IP, so the same user can't double-call.
  // The withRateLimit helper buckets by IP, which is fine for the dev target
  // (single-user); we ALSO do a per-user 1-call-in-5-minutes gate below.
  const rl = rateLimit(request, {
    windowMs: REBUILD_WINDOW_MS,
    maxRequests: REBUILD_MAX_PER_WINDOW,
    keyPrefix: "fts5:rebuild",
  });
  if (rl instanceof NextResponse) return rl;

  // Per-user 1-call-in-5-minutes gate. Implemented as a module-level
  // Map (single-process dev target — for a multi-process deploy this
  // would need a DB-backed store, which is out of scope).
  const now = Date.now();
  const lastCall = lastCallByUser.get(userId);
  if (lastCall && now - lastCall < REBUILD_WINDOW_MS) {
    const retryAfter = Math.ceil((REBUILD_WINDOW_MS - (now - lastCall)) / 1000);
    return NextResponse.json(
      {
        error: "FTS5 rebuild rate limited. Try again later.",
        retryAfterSeconds: retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }
  lastCallByUser.set(userId, now);

  const startedAt = Date.now();
  log.info("fts5:rebuild", "start", { userId });

  try {
    // 1. List all the calling user's DocumentChunk rows.
    // The ownership chain: DocumentChunk → Document → TradeCase → userId.
    // We join through Prisma to avoid a raw SQL interpolation.
    const userChunks = await prisma.documentChunk.findMany({
      where: { document: { tradeCase: { userId } } },
      select: { id: true, content: true },
      orderBy: { id: "asc" },
    });
    const userChunkIds = userChunks.map((c) => c.id);

    log.info("fts5:rebuild", "user chunk list loaded", {
      userId,
      count: userChunks.length,
    });

    // 2. Count the user's FTS rows BEFORE the rebuild. We re-use the
    //    same `where: chunkId IN (...)` pattern. The `ftsCount` helper
    //    returns the global count, so we need a targeted raw count
    //    here. We use a parameterized query.
    const before = await countFtsRowsForChunks(userChunkIds);

    // 3. Delete the user's FTS rows.
    if (userChunkIds.length > 0) {
      await ftsDeleteMany(userChunkIds);
    }

    // 4. Re-insert the user's FTS rows in batches.
    for (let i = 0; i < userChunks.length; i += BATCH_SIZE) {
      const batch = userChunks.slice(i, i + BATCH_SIZE);
      await ftsUpsertMany(
        batch.map((c) => ({ chunkId: c.id, content: c.content })),
      );
    }

    // 5. Verify the user's portion is now in sync. The user's FTS
    //    count should equal their DocumentChunk count.
    const after = await countFtsRowsForChunks(userChunkIds);
    const userFtsMatches = after === userChunks.length;

    // 6. Compute global health: ftsCount() vs total DocumentChunk
    //    count. Drift is informational — if there's prior orphan
    //    drift from a previous bug, the rebuild did not make it
    //    worse, but the operator may still want to run the global
    //    CLI script (`scripts/rebuild-fts5.mts`) to fully recover.
    const [globalFts, totalChunks] = await Promise.all([
      ftsCount(),
      prisma.documentChunk.count(),
    ]);
    const drift = globalFts - totalChunks;

    const durationMs = Date.now() - startedAt;
    log.info("fts5:rebuild", "done", {
      userId,
      userChunkCount: userChunks.length,
      userFtsBefore: before,
      userFtsAfter: after,
      userFtsMatches,
      globalFts,
      totalChunks,
      drift,
      durationMs,
    });

    return NextResponse.json({
      ok: userFtsMatches,
      userChunkCount: userChunks.length,
      userFtsCount: after,
      userFtsBefore: before,
      globalFtsRowCount: globalFts,
      globalChunkCount: totalChunks,
      globalDrift: drift,
      durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("fts5:rebuild", "failed", { userId, error: msg });
    return NextResponse.json(
      { error: "FTS5 rebuild failed", detail: msg.slice(0, 300) },
      { status: 500 },
    );
  }
}

const lastCallByUser = new Map<string, number>();

/**
 * Phase 14: clear the per-user rate-limit gate. Test-only; do not call
 * from production code paths. The verification script invokes this
 * to avoid back-to-back runs being 429'd.
 */
export function _resetFts5RateLimit(): void {
  lastCallByUser.clear();
}

/**
 * Count the FTS rows whose `chunkId` is in the given list. This is a
 * bounded, parameterized raw query. Used for the per-user verification
 * step in the rebuild.
 */
async function countFtsRowsForChunks(chunkIds: string[]): Promise<number> {
  if (chunkIds.length === 0) return 0;
  const placeholders = chunkIds.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT COUNT(*) AS n FROM document_chunk_fts WHERE chunkId IN (${placeholders})`,
    ...chunkIds,
  );
  const v = rows[0]?.n ?? 0;
  return typeof v === "bigint" ? Number(v) : v;
}
