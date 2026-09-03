/**
 * Phase 11 — Source Freshness.
 *
 * Source-of-truth dates in the schema:
 *  - `Document.processedAt` is the only date that reflects when a
 *    document was successfully processed by the queue. It is set by
 *    `processDocument` when status moves to `READY`.
 *  - `DocumentChunk.createdAt` is when the chunk row was inserted.
 *  - `Document.createdAt` is when the document record was created.
 *
 * Limitation: there is no "publication date" or "source effective date"
 * field. `processedAt` is the closest available proxy. The brief is
 * explicit: "If no trustworthy source-date metadata exists, do not
 * fabricate it. Document the limitation."
 *
 * Implementation:
 *  - We use `processedAt` as a soft additive boost on the final score.
 *  - The boost is bounded by `RAG_FRESHNESS_WEIGHT` (default 0.05 = 5%).
 *  - The boost is `weight * exp(-ageDays / halfLifeDays)` where
 *    `halfLifeDays` defaults to 90. So a chunk processed 90 days ago
 *    gets half the boost of a chunk processed today.
 *  - The boost is small enough to NEVER override relevance. A chunk
 *    with high relevance but old source still ranks above a chunk with
 *    low relevance but new source, in any normal case.
 *
 * Trade-case isolation: the freshness signal is applied per-document,
 * and documents are already filtered by `tradeCaseId` upstream. This
 * module does not need its own isolation check.
 */

import { SearchResult } from "../embeddings/search-service";

const DEFAULT_WEIGHT = parseFloat(process.env.RAG_FRESHNESS_WEIGHT || "0.05");
const DEFAULT_HALF_LIFE_DAYS = parseFloat(
  process.env.RAG_FRESHNESS_HALF_LIFE_DAYS || "90"
);

export interface FreshnessOptions {
  weight?: number;
  halfLifeDays?: number;
  /** Override "now" for tests. */
  now?: Date;
}

export interface FreshnessAnnotated extends SearchResult {
  /** The freshness boost added to the score (always >= 0). */
  freshnessBoost: number;
  /** Age in days at the time of the call (negative if `processedAt` is in the future). */
  ageDays: number | null;
}

/**
 * Compute the freshness boost for a single chunk. The chunk's score
 * becomes `chunk.similarity + boost`. The function clamps the final
 * value to [0, 1] to keep the rest of the pipeline's assumptions intact.
 */
export function applyFreshness(
  result: SearchResult,
  processedAt: Date | null | undefined,
  options: FreshnessOptions = {}
): FreshnessAnnotated {
  const weight = options.weight ?? DEFAULT_WEIGHT;
  const halfLife = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = options.now ?? new Date();

  if (!processedAt) {
    // No date → no boost. Document the limitation in the metadata.
    return { ...result, freshnessBoost: 0, ageDays: null };
  }

  const ageDays = Math.max(0, (now.getTime() - processedAt.getTime()) / 86_400_000);
  const decay = Math.exp(-ageDays / halfLife);
  const boost = weight * decay;

  // Apply the boost and clamp to [0, 1].
  const newSim = Math.max(0, Math.min(1, result.similarity + boost));

  return {
    ...result,
    similarity: newSim,
    freshnessBoost: boost,
    ageDays,
  };
}

/**
 * Apply freshness to a list of results in place. Returns a new list;
 * the input list is not mutated.
 */
export function applyFreshnessBatch(
  results: SearchResult[],
  processedAtByDocument: Map<string, Date | null>,
  options: FreshnessOptions = {}
): FreshnessAnnotated[] {
  return results.map((r) =>
    applyFreshness(r, processedAtByDocument.get(r.documentId) ?? null, options)
  );
}
