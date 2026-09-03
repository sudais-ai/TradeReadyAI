import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    include: {
      chunks: {
        include: { embeddings: true }
      },
      tradeCase: {
        include: { product: true }
      }
    }
  });
  
  for (const doc of docs) {
    console.log('Document: ' + doc.name + ' (' + doc.id + ')');
    console.log('  Trade Case: ' + doc.tradeCaseId + ' - Product: ' + (doc.tradeCase?.product?.name || 'N/A'));
    console.log('  Chunks: ' + doc.chunks.length);
    for (const chunk of doc.chunks) {
      console.log('    Chunk ' + chunk.chunkIndex + ': ' + chunk.content.substring(0, 50) + '... (' + chunk.id + ')');
      console.log('      Embeddings: ' + chunk.embeddings.length);
      for (const emb of chunk.embeddings) {
        console.log('        Provider: ' + emb.provider + ', Model: ' + emb.model + ', Dim: ' + emb.dimensions);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());