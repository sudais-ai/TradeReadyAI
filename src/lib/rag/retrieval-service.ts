import { searchSimilarChunks, SearchResult } from "../embeddings/search-service";
import { RAG_CONFIG } from "./config";
import { prisma } from "../db/prisma";

/**
 * Retrieves the most relevant chunks for a given requirement in a trade case.
 */
export async function retrieveEvidenceForRequirement(
  tradeCaseId: string,
  requirementId: string
): Promise<SearchResult[]> {
  // 1. Get the requirement to use as the query
  const requirement = await prisma.requirement.findFirst({
    where: { id: requirementId, tradeCaseId },
  });

  if (!requirement) {
    throw new Error(`Requirement ${requirementId} not found or does not belong to case ${tradeCaseId}`);
  }

  // 2. Perform the similarity search using the requirement title as the semantic query
  // The search service enforces TradeCase isolation.
  const chunks = await searchSimilarChunks(requirement.title, {
    tradeCaseId,
    topK: RAG_CONFIG.TOP_K,
    similarityThreshold: RAG_CONFIG.SIMILARITY_THRESHOLD,
  });

  return chunks;
}
