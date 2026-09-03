/**
 * Phase 11 — Context Expander (Parent/Child Retrieval).
 *
 * The `DocumentChunk` table does not have a "parent" or "child" relation;
 * it is a flat list of chunks per document, ordered by `chunkIndex`. The
 * most useful "context" for a matched chunk is the immediately adjacent
 * chunks of the same document — the ones before and after, which often
 * contain the sentence or paragraph the match came from.
 *
 * This module implements bounded neighbor expansion:
 *  - For each input chunk, fetch the chunks of the same document with
 *    `chunkIndex` in [chunkIndex - window, chunkIndex + window].
 *  - Window is configurable. Default = 1 (one chunk on each side).
 *  - The input chunks themselves are kept (they are the "center" of the
 *    expansion).
 *  - Duplicates are dropped; the order is preserved by chunkIndex.
 *
 * Trade-case isolation: every query is filtered by `tradeCaseId`. A
 * chunk is never expanded outside its own trade case, and the lookup
 * never returns chunks from a different document.
 */

import { prisma } from "../db/prisma";
import { SearchResult } from "../embeddings/search-service";

export interface ExpandOptions {
  /** Number of neighbors to include on each side. Default 1. */
  window?: number;
  /** Cap on total expanded chunks returned. Default 50. */
  maxChunks?: number;
}

interface ChunkRow {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  documentName: string;
}

/**
 * Expand a list of reranked candidates by fetching their neighbors.
 *
 * The input order is preserved: the first input chunk is followed by its
 * neighbors (in `chunkIndex` order), then the second input chunk and its
 * neighbors, etc. Duplicates are dropped.
 *
 * If `window = 0`, this is a no-op: the input list is returned as-is.
 */
export async function expandContext(
  candidates: SearchResult[],
  tradeCaseId: string,
  options: ExpandOptions = {}
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];
  const window = options.window ?? 1;
  const maxChunks = options.maxChunks ?? 50;

  if (window <= 0) {
    return candidates.slice(0, maxChunks);
  }

  // For each candidate, compute the (documentId, chunkIndex) range to
  // fetch. Group by documentId so we issue one query per document.
  const perDocument = new Map<
    string,
    { name: string; chunkIndexMin: number; chunkIndexMax: number; candidates: Set<string> }
  >();

  for (const c of candidates) {
    const e = perDocument.get(c.documentId);
    if (e) {
      e.chunkIndexMin = Math.min(e.chunkIndexMin, c.chunkIndex - window);
      e.chunkIndexMax = Math.max(e.chunkIndexMax, c.chunkIndex + window);
      e.candidates.add(c.chunkId);
    } else {
      perDocument.set(c.documentId, {
        name: c.documentName,
        chunkIndexMin: c.chunkIndex - window,
        chunkIndexMax: c.chunkIndex + window,
        candidates: new Set([c.chunkId]),
      });
    }
  }

  const expanded: SearchResult[] = [];
  const seen = new Set<string>();

  // We iterate the input candidates in their input order, and for each,
  // we walk its neighbors in chunkIndex order. This preserves "the
  // matched chunk is followed by its right-neighbor" as a stable property
  // useful for downstream context building.
  for (const c of candidates) {
    const range = perDocument.get(c.documentId);
    if (!range) continue;
    const neighbors = await prisma.documentChunk.findMany({
      where: {
        documentId: c.documentId,
        chunkIndex: { gte: range.chunkIndexMin, lte: range.chunkIndexMax },
        document: { tradeCaseId },
      },
      include: { document: { select: { name: true, tradeCaseId: true } } },
      orderBy: { chunkIndex: "asc" },
    });
    for (const n of neighbors) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const r: SearchResult = {
        chunkId: n.id,
        documentId: n.documentId,
        chunkIndex: n.chunkIndex,
        content: n.content,
        documentName: n.document.name,
        // We don't have a real score for neighbors; mirror the candidate's
        // score so the downstream context builder treats them uniformly.
        // The cross-encoder was already applied to the center chunks; the
        // neighbors are present for context, not for ranking.
        similarity: range.candidates.has(n.id) ? c.similarity : c.similarity * 0.5,
      };
      expanded.push(r);
      if (expanded.length >= maxChunks) {
        return expanded;
      }
    }
  }

  return expanded;
}
