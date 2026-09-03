import { prisma } from "../db/prisma";
import { getEmbeddingProvider } from "./index";
import { EMBEDDING_CONFIG } from "./config";
import { ProcessingStatus } from "../document-processing/processor";

const MAX_EMBEDDING_RETRIES = 3;

/**
 * Sanitizes error messages for safe storage and display.
 * Never exposes stack traces, file paths, or internal details.
 */
function sanitizeError(err: unknown, context: string): string {
  const baseMessage = err instanceof Error ? err.message : "An unexpected error occurred";
  const truncated = baseMessage.slice(0, 500);
  return `${context}: ${truncated}`;
}

/**
 * Validates that all vectors have finite values and correct dimensions.
 */
function validateVectors(vectors: number[][], expectedDimensions: number): void {
  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i];
    if (vector.length !== expectedDimensions) {
      throw new Error(`Vector ${i}: dimension mismatch - expected ${expectedDimensions}, got ${vector.length}`);
    }
    for (let j = 0; j < vector.length; j++) {
      if (!Number.isFinite(vector[j])) {
        throw new Error(`Vector ${i}[${j}]: non-finite value (${vector[j]})`);
      }
    }
  }
}

/**
 * Generates and stores embeddings for all chunks in a document.
 * 
 * Features:
 * - Idempotency: skips chunks that already have embeddings for the active model.
 * - Batching: processes chunks in batches to respect provider limits.
 * - Fault tolerance: updates the document status to FAILED safely if something goes wrong.
 * - Validation: ensures all vectors have finite values and correct dimensions.
 * 
 * @param documentId The ID of the document to process.
 */
export async function processDocumentEmbeddings(documentId: string): Promise<void> {
  const provider = getEmbeddingProvider();
  
  // 1. Mark embedding status as PROCESSING
  await prisma.document.update({
    where: { id: documentId },
    data: {
      embeddingStatus: ProcessingStatus.PROCESSING,
      embeddingError: null,
    },
  });

  try {
    // 2. Fetch all chunks for this document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (document.chunks.length === 0) {
      // Nothing to embed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          embeddingStatus: ProcessingStatus.READY,
          embeddedAt: new Date(),
        },
      });
      return;
    }

    // 3. Find chunks that already have an embedding for the CURRENT provider and model
    // This provides idempotency. If we reprocess but the model hasn't changed, we save time/money.
    const existingEmbeddings = await prisma.documentChunkEmbedding.findMany({
      where: {
        chunkId: { in: document.chunks.map((c) => c.id) },
        provider: provider.name,
        model: EMBEDDING_CONFIG.MODEL,
      },
      select: { chunkId: true },
    });

    const existingChunkIds = new Set(existingEmbeddings.map((e) => e.chunkId));
    
    // Filter out chunks that are already embedded
    const chunksToProcess = document.chunks.filter((c) => !existingChunkIds.has(c.id));

    // 4. Process in batches
    const batchSize = EMBEDDING_CONFIG.BATCH_SIZE;
    
    for (let i = 0; i < chunksToProcess.length; i += batchSize) {
      const batch = chunksToProcess.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);

      // Call the provider
      const vectors = await provider.generateEmbeddings(texts);

      if (vectors.length !== batch.length) {
        throw new Error(`Provider returned ${vectors.length} vectors for ${batch.length} chunks.`);
      }

      // Validate vectors before storing
      validateVectors(vectors, EMBEDDING_CONFIG.DIMENSIONS);

      // 5. Store embeddings in a transaction
      await prisma.$transaction(
        batch.map((chunk, index) => {
          const vector = vectors[index];
          
          return prisma.documentChunkEmbedding.upsert({
            where: {
              chunkId_provider_model: {
                chunkId: chunk.id,
                provider: provider.name,
                model: EMBEDDING_CONFIG.MODEL,
              },
            },
            update: {
              vector: JSON.stringify(vector),
              dimensions: vector.length,
            },
            create: {
              chunkId: chunk.id,
              provider: provider.name,
              model: EMBEDDING_CONFIG.MODEL,
              dimensions: vector.length,
              vector: JSON.stringify(vector), // Store as stringified JSON in SQLite
            },
          });
        })
      );
    }

    // 6. Mark as READY
    await prisma.document.update({
      where: { id: documentId },
      data: {
        embeddingStatus: ProcessingStatus.READY,
        embeddedAt: new Date(),
        embeddingError: null,
      },
    });

    // 7. Phase 11: sync the FTS5 keyword index with the chunk contents.
    //    Best-effort: if the FTS5 sync fails, we do NOT downgrade the
    //    document status. The hybrid retriever treats FTS5 as a
    //    recall-boosting layer; if it is unavailable, the vector path
    //    still works. We log so operators can see it.
    try {
      const { ftsUpsertMany } = await import("../rag/keyword-retriever");
      await ftsUpsertMany(
        document.chunks.map((c) => ({ chunkId: c.id, content: c.content }))
      );
    } catch (ftsErr) {
      console.warn(
        `[embedding] FTS5 sync failed for document ${documentId}:`,
        ftsErr instanceof Error ? ftsErr.message : String(ftsErr)
      );
    }

  } catch (err) {
    console.error(`Failed to process embeddings for document ${documentId}:`, err);
    
    const safeMessage = sanitizeError(err, "Embedding generation failed");
    
    await prisma.document.update({
      where: { id: documentId },
      data: {
        embeddingStatus: ProcessingStatus.FAILED,
        embeddingError: safeMessage,
      },
    });
  }
}

/**
 * Processes embeddings with bounded retries and exponential backoff.
 */
export async function processDocumentEmbeddingsWithRetry(
  documentId: string,
  attempt: number = 1
): Promise<void> {
  try {
    await processDocumentEmbeddings(documentId);
  } catch (err) {
    if (attempt < MAX_EMBEDDING_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return processDocumentEmbeddingsWithRetry(documentId, attempt + 1);
    }
    throw err;
  }
}
