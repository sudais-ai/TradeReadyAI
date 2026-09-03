"use server";

import { searchSimilarChunks, SearchOptions, SearchResult } from "@/lib/embeddings/search-service";
import { retrieveEvidenceAdvanced, AdvancedRetrieveOptions } from "@/lib/rag/advanced-retriever";
import { requireAuth, requireOwnedTradeCase } from "@/lib/auth/session";

export async function searchChunksAction(
  query: string,
  tradeCaseId: string,
  options?: Partial<SearchOptions>
): Promise<{ success: boolean; results?: SearchResult[]; error?: string }> {
  try {
    if (!query) return { success: false, error: "Query is required." };
    if (!tradeCaseId) return { success: false, error: "Trade case ID is required." };

    // Security: enforce signed-in + ownership before allowing semantic search.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const results = await searchSimilarChunks(query, {
      tradeCaseId,
      ...options,
    });

    return { success: true, results };
  } catch (error) {
    console.error("Dev search error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to perform similarity search.",
    };
  }
}

/**
 * Phase 11 — Advanced RAG search action.
 *
 * Same authorization as `searchChunksAction`, but the underlying pipeline
 * is the full Advanced RAG stack: query rewrite → keyword+vector →
 * RRF hybrid → cross-encoder rerank → neighbor expansion → freshness.
 */
export async function searchChunksAdvancedAction(
  query: string,
  tradeCaseId: string,
  options?: Partial<AdvancedRetrieveOptions>
): Promise<{
  success: boolean;
  results?: SearchResult[];
  stages?: {
    keywordCount: number;
    vectorCount: number;
    hybridCount: number;
    rerankFromModel: boolean;
    freshnessApplied: boolean;
  };
  error?: string;
}> {
  try {
    if (!query) return { success: false, error: "Query is required." };
    if (!tradeCaseId) return { success: false, error: "Trade case ID is required." };

    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const out = await retrieveEvidenceAdvanced(query, {
      tradeCaseId,
      ...options,
    });

    return {
      success: true,
      results: out.results,
      stages: {
        keywordCount: out.stages.keywordCount,
        vectorCount: out.stages.vectorCount,
        hybridCount: out.stages.hybridCount,
        rerankFromModel: out.stages.rerank.fromModel,
        freshnessApplied: out.stages.freshnessApplied,
      },
    };
  } catch (error) {
    console.error("Advanced dev search error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to perform advanced search.",
    };
  }
}
