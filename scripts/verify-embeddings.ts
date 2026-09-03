/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const { searchSimilarChunks } = require('../src/lib/embeddings/search-service');
const { LocalEmbeddingProvider } = require('../src/lib/embeddings/providers/local-provider');

const prisma = new PrismaClient();

async function main() {
  console.log("=== Verifying Embeddings (LocalEmbeddingProvider: Xenova/all-MiniLM-L6-v2) ===");

  // 1. Get a Trade Case
  const tradeCase = await prisma.tradeCase.findFirst({
    include: {
      documents: {
        include: {
          chunks: {
            include: { embeddings: true }
          }
        }
      }
    }
  });

  if (!tradeCase) {
    console.error("No trade cases found. Please upload a document first.");
    return;
  }

  console.log(`Testing with Case: ${tradeCase.productName} (${tradeCase.id})`);

  let totalChunks = 0;
  let totalEmbeddings = 0;

  for (const doc of tradeCase.documents) {
    totalChunks += doc.chunks.length;
    totalEmbeddings += doc.chunks.reduce((acc: number, c: any) => acc + c.embeddings.length, 0);
  }

  console.log(`Total Chunks: ${totalChunks}`);
  console.log(`Total Embeddings: ${totalEmbeddings}`);

  if (totalEmbeddings === 0) {
    console.warn("No embeddings generated yet. Upload a document to trigger the pipeline.");
    return;
  }

  // 2. Perform a similarity search
  console.log("\n--- Testing Similarity Search ---");
  const query = "What are the rules and regulations?";
  
  // Use LocalEmbeddingProvider for real semantic embeddings
  const provider = new LocalEmbeddingProvider();
  const queryVector = await provider.generateEmbedding(query);

  const embeddings = await prisma.documentChunkEmbedding.findMany({
    where: {
      chunk: {
        document: {
          tradeCaseId: tradeCase.id,
        },
      },
    },
    include: {
      chunk: {
        include: {
          document: { select: { name: true } },
        },
      },
    },
  });

  const scored = embeddings.map((emb: any) => {
    const vector = JSON.parse(emb.vector);
    let dotProduct = 0;
    for (let i = 0; i < vector.length; i++) {
      dotProduct += queryVector[i] * vector[i];
    }
    return {
      docName: emb.chunk.document.name,
      chunkIndex: emb.chunk.chunkIndex,
      similarity: dotProduct,
      content: emb.chunk.content.substring(0, 50) + "..."
    };
  });

  scored.sort((a: any, b: any) => b.similarity - a.similarity);
  
  console.log(`Search Query: "${query}"`);
  console.log("Top 3 Results:");
  scored.slice(0, 3).forEach((res: any, i: number) => {
    console.log(`${i+1}. [${res.similarity.toFixed(4)}] ${res.docName} (Chunk ${res.chunkIndex}): ${res.content}`);
  });

  // 3. Verify embedding dimensions
  console.log("\n--- Verifying Embedding Dimensions ---");
  const sampleEmbedding = embeddings[0];
  if (sampleEmbedding) {
    const vector = JSON.parse(sampleEmbedding.vector);
    console.log(`Embedding dimensions: ${vector.length}`);
    console.log(`Expected dimensions: 384`);
    console.log(`Dimensions match: ${vector.length === 384 ? "✅ YES" : "❌ NO"}`);
    
    // Check all values are finite
    const allFinite = vector.every((v: number) => Number.isFinite(v));
    console.log(`All values finite: ${allFinite ? "✅ YES" : "❌ NO"}`);
    
    // Check provider/model metadata
    console.log(`Provider: ${sampleEmbedding.provider}`);
    console.log(`Model: ${sampleEmbedding.model}`);
    console.log(`Provider correct: ${sampleEmbedding.provider === "local" ? "✅ YES" : "❌ NO"}`);
    console.log(`Model correct: ${sampleEmbedding.model === "Xenova/all-MiniLM-L6-v2" ? "✅ YES" : "❌ NO"}`);
  }

  console.log("\nVerification complete!");
}

main()
  .catch((e) => {
    console.error("Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
