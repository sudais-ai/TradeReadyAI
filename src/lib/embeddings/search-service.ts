import { prisma } from "../db/prisma";
import { getEmbeddingProvider } from "./index";
import { EMBEDDING_CONFIG } from "./config";

export interface SearchOptions {
  tradeCaseId: string; // MANDATORY for security/isolation
  topK?: number;
  similarityThreshold?: number;
  provider?: string;
  model?: string;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  documentName: string;
}

/**
 * Calculates the cosine similarity between two vectors.
 * Assumes vectors are already L2 normalized.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vector dimension mismatch");
  }
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

/**
 * Searches for the most semantically similar chunks within a specific Trade Case.
 */
export async function searchSimilarChunks(
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const {
    tradeCaseId,
    topK = EMBEDDING_CONFIG.DEFAULT_TOP_K,
    similarityThreshold = EMBEDDING_CONFIG.DEFAULT_SIMILARITY_THRESHOLD,
    provider = getEmbeddingProvider().name,
    model = EMBEDDING_CONFIG.MODEL,
  } = options;

  if (!tradeCaseId) {
    throw new Error("tradeCaseId is required for secure similarity search.");
  }

  // 1. Generate embedding for the query
  const embeddingProvider = getEmbeddingProvider();
  const queryVector = await embeddingProvider.generateEmbedding(query);

  // 2. Fetch all embeddings for the specified Trade Case
  // We join through DocumentChunk -> Document to enforce the tradeCaseId isolation.
  // Phase 13: also filter soft-deleted documents AND soft-deleted cases.
  // A soft-deleted document's chunks/embeddings remain in the DB until the
  // user restores the document; they must not appear in RAG retrieval.
  const embeddings = await prisma.documentChunkEmbedding.findMany({
    where: {
      provider,
      model,
      chunk: {
        document: {
          tradeCaseId: tradeCaseId,
          deletedAt: null,
          tradeCase: { deletedAt: null },
        },
      },
    },
    include: {
      chunk: {
        include: {
          document: {
            select: { name: true, tradeCaseId: true, deletedAt: true },
          },
        },
      },
    },
  });

  if (embeddings.length === 0) {
    return [];
  }

  // 3. Calculate similarities in memory
  // This is acceptable for the SQLite foundation. When moving to PostgreSQL,
  // this would be replaced with a pgvector ORDER BY <-> clause.
  const scoredChunks = embeddings.map((emb) => {
    try {
      const vector = JSON.parse(emb.vector) as number[];
      const similarity = cosineSimilarity(queryVector, vector);
      
      return {
        chunkId: emb.chunk.id,
        documentId: emb.chunk.documentId,
        chunkIndex: emb.chunk.chunkIndex,
        content: emb.chunk.content,
        documentName: emb.chunk.document.name,
        similarity,
      };
    } catch (e) {
      console.error(`Failed to parse/compare vector for chunk ${emb.chunkId}:`, e);
      return null;
    }
  });

  // 4. Filter and sort
  const validScoredChunks = scoredChunks.filter((item): item is NonNullable<typeof item> => 
    item !== null && item.similarity >= similarityThreshold
  );

  validScoredChunks.sort((a, b) => b.similarity - a.similarity);

  // 5. Return top K
  return validScoredChunks.slice(0, topK);
}
