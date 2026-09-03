/**
 * Phase 11 — Hybrid Retrieval with Reciprocal Rank Fusion (RRF).
 *
 * Merges results from the keyword (FTS5) and vector (cosine) retrievers
 * into a single ranked list. RRF is the standard fusion algorithm:
 *
 *     score(d) = sum over sources s of  1 / (k + rank_s(d))
 *
 * where `rank_s(d)` is the position of document `d` in source `s` (1-based;
 * documents not in `s` contribute 0). The constant `k` is a smoothing
 * parameter — k=60 is the value used in the original Cormack et al. 2009
 * paper and is the conventional default.
 *
 * Deduplication: by `chunkId`. The same chunk may be returned by both
 * sources, in which case its RRF score is the sum of the two contributions.
 *
 * Security: both underlying retrievers receive the same `tradeCaseId`. This
 * layer does NOT relax the isolation — it only merges candidates.
 */

import { SearchResult } from "../embeddings/search-service";

export interface HybridOptions {
  /** RRF smoothing parameter. Default 60. */
  k?: number;
  /** Maximum candidates to keep after fusion. Default 20. */
  topK?: number;
}

export interface RankedCandidate {
  result: SearchResult;
  rrfScore: number;
  sources: Array<"keyword" | "vector">;
  ranks: Array<{ source: "keyword" | "vector"; rank: number }>;
}

/**
 * Run RRF over a keyword list and a vector list. Both lists are already
 * ordered by their source-specific score (best first).
 *
 * @returns A list of `RankedCandidate`s, ordered by `rrfScore` descending.
 */
export function reciprocalRankFusion(
  keywordResults: SearchResult[],
  vectorResults: SearchResult[],
  options: HybridOptions = {}
): RankedCandidate[] {
  const k = options.k ?? 60;
  const topK = options.topK ?? 20;

  const acc = new Map<string, RankedCandidate>();

  const addAt = (
    source: "keyword" | "vector",
    list: SearchResult[]
  ): void => {
    list.forEach((r, idx) => {
      const rank = idx + 1; // 1-based
      const contrib = 1 / (k + rank);
      const existing = acc.get(r.chunkId);
      if (existing) {
        existing.rrfScore += contrib;
        existing.sources.push(source);
        existing.ranks.push({ source, rank });
      } else {
        acc.set(r.chunkId, {
          result: r,
          rrfScore: contrib,
          sources: [source],
          ranks: [{ source, rank }],
        });
      }
    });
  };

  addAt("keyword", keywordResults);
  addAt("vector", vectorResults);

  const merged = Array.from(acc.values()).sort((a, b) => b.rrfScore - a.rrfScore);
  return merged.slice(0, topK);
}

/**
 * Convenience: take a `RankedCandidate[]` and return just the `SearchResult[]`,
 * preserving the new ranking. Also stamps the new (RRF) score onto
 * `SearchResult.similarity` so the rest of the pipeline sees one consistent
 * number. The original per-source similarities are NOT preserved on the
 * result (use the `RankedCandidate` form if you need them).
 */
export function toSearchResults(candidates: RankedCandidate[]): SearchResult[] {
  return candidates.map((c) => ({
    chunkId: c.result.chunkId,
    documentId: c.result.documentId,
    chunkIndex: c.result.chunkIndex,
    content: c.result.content,
    documentName: c.result.documentName,
    // Normalize RRF score into the [0, 1] similarity slot. With k=60 and
    // both sources returning a top-1 hit, the max RRF is 2 * 1/61 ≈ 0.0328.
    // We map to 0..1 with a soft cap: similarity = 1 - exp(-rrf / 0.02).
    // This is a monotonic transform and is the simplest sane scaling.
    similarity: 1 - Math.exp(-c.rrfScore / 0.02),
  }));
}
