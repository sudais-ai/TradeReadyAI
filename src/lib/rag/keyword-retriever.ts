/**
 * Phase 11 — BM25 / Keyword Retriever using SQLite FTS5.
 *
 * Architecture (preserved from audit):
 *  - No new dependencies. FTS5 ships with SQLite 3.45.0.
 *  - The FTS5 virtual table is created at first use via a raw `CREATE VIRTUAL TABLE`
 *    statement, then kept in sync with `DocumentChunk` via the `upsertMany` and
 *    `deleteMany` helpers.
 *  - Prisma's SQLite connector does not model FTS5 virtual tables, so we use
 *    `prisma.$executeRawUnsafe` and `prisma.$queryRawUnsafe`. The single-row
 *    "shadow" table is the only place we deviate from Prisma types.
 *  - Trade-case isolation: every search query includes `WHERE tradeCaseId = ?`.
 *    The FTS5 table itself does not contain `tradeCaseId`; we join it back
 *    through the source `DocumentChunk` -> `Document` chain, so any candidate
 *    that doesn't belong to the requested trade case is filtered out.
 *
 * Schema:
 *   CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_fts USING fts5(
 *     chunkId UNINDEXED,
 *     content,
 *     tokenize = "porter unicode61"
 *   )
 *
 * The `tokenize = "porter unicode61"` setting gives stemming + Unicode
 * normalization out of the box, which is what BM25 papers use as a baseline.
 */

import { prisma } from "../db/prisma";
import { SearchResult } from "../embeddings/search-service";
import { log } from "../log";

const FTS_TABLE = "document_chunk_fts";

/**
 * The shape of a row from the FTS5 virtual table joined back to DocumentChunk
 * and Document. The `bm25()` rank is a lower-is-better value (SQLite convention);
 * we flip the sign so the final `similarity`-like score is higher-is-better,
 * matching `SearchResult.similarity`.
 */
interface FtsRow {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  documentName: string;
  tradeCaseId: string;
  bm25: number;
}

let ftsInitialized = false;
let ftsInitPromise: Promise<void> | null = null;

/**
 * Create the FTS5 virtual table if it does not exist. Idempotent.
 * Uses `IF NOT EXISTS` so it's safe to call on every server boot.
 */
async function ensureFtsTable(): Promise<void> {
  if (ftsInitialized) return;
  if (!ftsInitPromise) {
    ftsInitPromise = (async () => {
      try {
        // Use IF NOT EXISTS for idempotency. This is harmless on every boot.
        await prisma.$executeRawUnsafe(
          `CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
             chunkId UNINDEXED,
             content,
             tokenize = 'porter unicode61'
           )`
        );
        ftsInitialized = true;
        log.info("rag:fts5", "FTS5 virtual table ready", { table: FTS_TABLE });
      } catch (err) {
        // Reset the cached promise so a later call can retry.
        ftsInitPromise = null;
        log.error("rag:fts5", "failed to create FTS5 table", {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    })();
  }
  return ftsInitPromise;
}

/**
 * Escape a user-supplied FTS5 MATCH query. FTS5's MATCH syntax treats
 * bare words as terms but reserves characters like `"`, `*`, `(`, `)`, etc.
 * We quote the whole query as a string and double any embedded quotes.
 *
 * This is a small, well-defined sanitization — it is NOT a guarantee that
 * a user-crafted query is "safe" in any auth sense (the FTS5 index only
 * contains public-to-this-trade-case chunks after the JOIN), but it
 * prevents malformed-query exceptions at the SQLite layer.
 */
function escapeFtsQuery(q: string): string {
  // Strip control characters and collapse whitespace.
  // eslint-disable-next-line no-control-regex
  const cleaned = q.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (cleaned.length === 0) return "";
  // Tokenize on whitespace and non-alphanumeric (keep HS codes, reg
  // numbers, and slashes). Quote each token so FTS5 treats it as a
  // literal, then OR them so partial matches still match.
  const tokens = cleaned
    .split(/[^A-Za-z0-9./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  const quoted = tokens.map((t) => `"${t.replace(/"/g, '""')}"`);
  return quoted.join(" OR ");
}

/**
 * Insert or replace a single chunk in the FTS index. We use `INSERT OR REPLACE`
 * so this is safe to call from a re-processing path.
 */
export async function ftsUpsertChunk(
  chunkId: string,
  content: string
): Promise<void> {
  await ensureFtsTable();
  // Parameterized statement; SQLite is safe with this binding style.
  // We use $executeRawUnsafe only because Prisma can't model a virtual table.
  // The values themselves are passed via ? placeholders, NOT interpolated.
  await prisma.$executeRawUnsafe(
    `INSERT OR REPLACE INTO ${FTS_TABLE} (chunkId, content) VALUES (?, ?)`,
    chunkId,
    content
  );
}

/**
 * Bulk upsert — fewer round-trips when many chunks are written at once.
 */
export async function ftsUpsertMany(
  rows: Array<{ chunkId: string; content: string }>
): Promise<void> {
  if (rows.length === 0) return;
  await ensureFtsTable();
  // We loop because Prisma's `$executeRawUnsafe` doesn't accept an array binding
  // for a multi-row INSERT. The individual statements run inside a single
  // connection so the total cost is low.
  for (const r of rows) {
    await prisma.$executeRawUnsafe(
      `INSERT OR REPLACE INTO ${FTS_TABLE} (chunkId, content) VALUES (?, ?)`,
      r.chunkId,
      r.content
    );
  }
}

/**
 * Remove a chunk from the FTS index (used when DocumentChunk rows are deleted).
 */
export async function ftsDeleteChunk(chunkId: string): Promise<void> {
  await ensureFtsTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM ${FTS_TABLE} WHERE chunkId = ?`,
    chunkId
  );
}

/**
 * Remove many chunks. Same parameter binding as above.
 */
export async function ftsDeleteMany(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  await ensureFtsTable();
  for (const id of chunkIds) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${FTS_TABLE} WHERE chunkId = ?`,
      id
    );
  }
}

/**
 * Drop the entire FTS table. Used by the verify script for clean-room setup.
 * NOT used in the request path.
 */
export async function ftsDrop(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${FTS_TABLE}`);
  ftsInitialized = false;
  ftsInitPromise = null;
}

/**
 * Total row count. Used by the verify script to confirm sync.
 */
export async function ftsCount(): Promise<number> {
  await ensureFtsTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT COUNT(*) AS n FROM ${FTS_TABLE}`
  );
  const v = rows[0]?.n ?? 0;
  return typeof v === "bigint" ? Number(v) : v;
}

export interface KeywordSearchOptions {
  tradeCaseId: string; // MANDATORY for security/isolation
  topK?: number;
  /** Optional: bound the FTS5 MATCH, e.g. limit by documentId. */
  documentId?: string;
  /** Optional: exclude these chunkIds from results (e.g. already-reranked ones). */
  excludeChunkIds?: string[];
}

/**
 * Run a keyword (BM25) search over the FTS5 index, scoped to one trade case.
 *
 * Returns SearchResult[] ordered by best-BM25 first, with the FTS5 rank
 * normalized to a [0, 1]-ish range via `1 / (1 + |bm25|)`. This is not
 * a calibrated probability — it is a monotonic, comparable score that
 * the RRF fusion layer can consume.
 */
export async function searchKeyword(
  query: string,
  options: KeywordSearchOptions
): Promise<SearchResult[]> {
  if (!options.tradeCaseId) {
    throw new Error("tradeCaseId is required for keyword search.");
  }
  const ftsQuery = escapeFtsQuery(query);
  if (ftsQuery.length === 0) {
    return [];
  }
  await ensureFtsTable();

  // Build the JOIN through DocumentChunk -> Document to enforce tradeCaseId.
  // We pull the bm25() value (lower-is-better) and project a higher-is-better
  // similarity so the downstream RRF merger can sum ranks.
  //
  // The `LIKE` filter for documentId is optional; if not supplied, all
  // documents in the trade case are eligible.
  const documentIdFilter = options.documentId
    ? `AND d.id = ?`
    : ``;

  const sql = `
    SELECT
      fts.chunkId        AS chunkId,
      c.documentId       AS documentId,
      c.chunkIndex       AS chunkIndex,
      c.content          AS content,
      d.name             AS documentName,
      d.tradeCaseId      AS tradeCaseId,
      bm25(${FTS_TABLE}) AS bm25
    FROM ${FTS_TABLE} fts
    JOIN DocumentChunk c ON c.id = fts.chunkId
    JOIN Document      d ON d.id = c.documentId
    JOIN TradeCase     tc ON tc.id = d.tradeCaseId
    WHERE ${FTS_TABLE} MATCH ?
      AND d.tradeCaseId = ?
      AND d.deletedAt IS NULL
      AND tc.deletedAt IS NULL
      ${documentIdFilter}
    ORDER BY bm25(${FTS_TABLE}) ASC
    LIMIT ?
  `;

  const bindings: Array<string | number> = [ftsQuery, options.tradeCaseId];
  if (options.documentId) bindings.push(options.documentId);
  bindings.push(options.topK ?? 20);

  const rows = await prisma.$queryRawUnsafe<FtsRow[]>(sql, ...bindings);

  let results: SearchResult[] = rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    chunkIndex: r.chunkIndex,
    content: r.content,
    documentName: r.documentName,
    // bm25 is negative for matches in FTS5. The smaller the bm25, the better.
    // 1 / (1 - bm25) yields a positive, higher-is-better score. bm25 = -2 → 1/3.
    // We clamp to [0, 1] just in case bm25 is positive (no match — shouldn't
    // happen because the WHERE has a MATCH clause, but defensive).
    similarity: Math.max(0, Math.min(1, 1 / (1 - r.bm25))),
  }));

  if (options.excludeChunkIds && options.excludeChunkIds.length > 0) {
    const excl = new Set(options.excludeChunkIds);
    results = results.filter((r) => !excl.has(r.chunkId));
  }

  return results;
}
