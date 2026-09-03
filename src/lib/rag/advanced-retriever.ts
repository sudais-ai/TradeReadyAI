/**
 * Phase 11 — Advanced Retriever.
 *
 * The orchestration layer that composes the nine Advanced RAG areas:
 *   A. Query Rewrite   (query-rewriter)
 *   B. Keyword / BM25  (keyword-retriever — FTS5)
 *   C. Vector          (embeddings/search-service — bi-encoder cosine)
 *   D. Hybrid          (hybrid-retriever — RRF)
 *   E. Metadata        (metadata-filter)
 *   F. Rerank          (reranker — cross-encoder)
 *   G. Parent/Child    (context-expander — neighbor expansion)
 *   H. Freshness       (freshness — additive boost)
 *   I. Citation Valid. (citation-validator — used downstream, not here)
 *
 * The retrieval itself produces `SearchResult[]` after steps A–H. The
 * citation validator (I) is invoked by the evaluation-service, not here,
 * because the AI is the one that emits citations.
 *
 * This module's single export is `retrieveEvidenceAdvanced`. It is the
 * Phase 11 replacement for the simple `retrieveEvidenceForRequirement`,
 * which still exists for callers that want the legacy path.
 *
 * Trade-case isolation: `tradeCaseId` is required and is the first thing
 * the function checks. Every downstream query is scoped to that case.
 */

import { prisma } from "../db/prisma";
import { searchSimilarChunks, SearchResult } from "../embeddings/search-service";
import { rewriteQuery, QueryRewrite } from "./query-rewriter";
import { searchKeyword } from "./keyword-retriever";
import {
  reciprocalRankFusion,
  toSearchResults,
  RankedCandidate,
} from "./hybrid-retriever";
import { rerank, RerankResult } from "./reranker";
import { expandContext } from "./context-expander";
import { applyFreshnessBatch, FreshnessAnnotated } from "./freshness";
import { MetadataFilter, validateMetadataFilter } from "./metadata-filter";
import { log } from "../log";

export interface AdvancedRetrieveOptions extends Partial<MetadataFilter> {
  /** Disable the LLM-based query rewrite. Default false (enabled). */
  noQueryRewrite?: boolean;
  /** Disable the cross-encoder reranker. Default false (enabled). */
  noRerank?: boolean;
  /** Override the cross-encoder model. */
  rerankModelId?: string;
  /** Top K for the initial retrieval. Default 20. */
  topKRetrieve?: number;
  /** Top K after rerank. Default 10. */
  topKAfterRerank?: number;
  /** Neighbors on each side for context expansion. Default 1. */
  contextWindow?: number;
  /** Override the RRF `k` constant. Default 60. */
  rrfK?: number;
  /** Override the freshness weight. Default 0.05. */
  freshnessWeight?: number;
}

export interface AdvancedRetrieveResult {
  /** Final candidates after all stages, in their final ranking. */
  results: SearchResult[];
  /** Per-stage metadata for observability + verify scripts. */
  stages: {
    queryRewrite: { fromLlm: boolean; terms: string[] };
    keywordCount: number;
    vectorCount: number;
    hybridCount: number;
    rerank: { fromModel: boolean; scores: number[] };
    expansionBefore: number;
    expansionAfter: number;
    freshnessApplied: boolean;
  };
  /** Optional: the original query-rewrite object (for debugging). */
  rewrite: QueryRewrite;
  /** True if the reranker (or any downstream stage) failed and fell back. */
  degraded: boolean;
}

export async function retrieveEvidenceAdvanced(
  query: string,
  options: AdvancedRetrieveOptions
): Promise<AdvancedRetrieveResult> {
  // 1. Validate metadata filter (throws if tradeCaseId missing).
  //    `validateMetadataFilter` returns a fully-typed object with
  //    `tradeCaseId` guaranteed to be a string, so the destructured
  //    variables below are `string` (not `string | undefined`).
  const { tradeCaseId, documentId, processingStatus, minProcessedAt, maxProcessedAt } =
    validateMetadataFilter(options);

  const topKRetrieve = options.topKRetrieve ?? 20;
  const topKAfterRerank = options.topKAfterRerank ?? 10;
  const contextWindow = options.contextWindow ?? 1;
  const rrfK = options.rrfK ?? 60;

  // 2. Query rewrite (A). Always preserves the original.
  const rewrite = await rewriteQuery(query, {
    useLlm: !options.noQueryRewrite,
  });

  // The keyword retriever benefits from BOTH the original and the rewrite
  // because user prompts sometimes include identifiers that the LLM
  // may drop. We send the original as the primary query; the rewrite
  // is an extra safety net.
  const keywordQuery = rewrite.original;
  // The vector retriever benefits from the natural-language rewrite, which
  // is shorter and may focus on the "what is the requirement about" intent.
  const vectorQuery = rewrite.rewrite.rewritten || rewrite.original;

  // 3. Stage B + C: keyword + vector in parallel.
  const [keywordResults, vectorResults] = await Promise.all([
    searchKeyword(keywordQuery, {
      tradeCaseId,
      topK: topKRetrieve,
      documentId,
    }).catch((err) => {
      log.warn("rag:advanced", "keyword retrieval failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [] as SearchResult[];
    }),
    searchSimilarChunks(vectorQuery, {
      tradeCaseId,
      topK: topKRetrieve,
      // Vector retriever does not yet accept documentId; we filter post-hoc below.
    }).catch((err) => {
      log.warn("rag:advanced", "vector retrieval failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [] as SearchResult[];
    }),
  ]);

  // 4. Post-filter vector results by documentId if requested.
  let filteredVector = vectorResults;
  if (documentId) {
    filteredVector = vectorResults.filter(
      (r) => r.documentId === documentId
    );
  }

  // 5. Stage D: hybrid (RRF) fusion.
  const fused: RankedCandidate[] = reciprocalRankFusion(
    keywordResults,
    filteredVector,
    { k: rrfK, topK: topKRetrieve }
  );
  const fusedResults: SearchResult[] = toSearchResults(fused);

  // 6. Stage F: cross-encoder rerank. (E — metadata filter — is already
  //    applied via the `documentId` parameter above and via the tradeCaseId
  //    enforcement in the underlying retrievers.)
  let rerankOut: RerankResult;
  if (options.noRerank) {
    rerankOut = {
      results: fusedResults.slice(0, topKAfterRerank),
      fromModel: false,
      scores: fusedResults.slice(0, topKAfterRerank).map(() => 0),
    };
  } else {
    rerankOut = await rerank(rewrite.original, fusedResults, {
      modelId: options.rerankModelId,
      topK: topKAfterRerank,
    });
  }

  // 7. Stage G: parent/child context expansion (neighbors).
  const expansionBefore = rerankOut.results.length;
  const expanded = await expandContext(
    rerankOut.results,
    tradeCaseId,
    { window: contextWindow }
  );

  // 8. Stage H: freshness boost. We need each document's processedAt;
  //    fetch once for all unique documentIds. Phase 13: also filter
  //    soft-deleted documents (and their soft-deleted parent cases)
  //    so the freshness map never carries a row that should be hidden.
  const uniqueDocIds = Array.from(new Set(expanded.map((r) => r.documentId)));
  const docRows = uniqueDocIds.length
    ? await prisma.document.findMany({
        where: {
          id: { in: uniqueDocIds },
          tradeCaseId,
          deletedAt: null,
          tradeCase: { deletedAt: null },
        },
        select: { id: true, processedAt: true },
      })
    : [];
  const processedAtByDocument = new Map<string, Date | null>(
    docRows.map((d) => [d.id, d.processedAt])
  );

  const withFreshness: FreshnessAnnotated[] = applyFreshnessBatch(
    expanded,
    processedAtByDocument,
    { weight: options.freshnessWeight }
  );

  // 9. Sort by final score (already mostly sorted; explicit sort to be safe)
  //    and re-cast back to SearchResult[] (drop the FreshnessAnnotated extra fields).
  withFreshness.sort((a, b) => b.similarity - a.similarity);
  const final: SearchResult[] = withFreshness.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    chunkIndex: r.chunkIndex,
    content: r.content,
    documentName: r.documentName,
    similarity: r.similarity,
  }));

  return {
    results: final,
    stages: {
      queryRewrite: { fromLlm: rewrite.fromLlm, terms: rewrite.rewrite.terms },
      keywordCount: keywordResults.length,
      vectorCount: filteredVector.length,
      hybridCount: fused.length,
      rerank: { fromModel: rerankOut.fromModel, scores: rerankOut.scores },
      expansionBefore,
      expansionAfter: expanded.length,
      freshnessApplied: true,
    },
    rewrite: rewrite.rewrite,
    degraded: !rerankOut.fromModel,
  };
}
