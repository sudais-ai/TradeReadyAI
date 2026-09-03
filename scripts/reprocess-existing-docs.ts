/**
 * One-time migration: reprocess all existing documents that have
 * extractedText stored but were processed before chunking was added.
 *
 * Run: npx tsx scripts/reprocess-existing-docs.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { processDocument } from "../src/lib/document-processing/processing-service";

async function main() {
  // Find all docs that have a file but no chunks yet
  const docs = await prisma.document.findMany({
    where: {
      fileRef: { not: null },
      mimeType: { not: null },
      chunks: { none: {} },
    },
    select: { id: true, name: true, processingStatus: true },
  });

  if (docs.length === 0) {
    console.log("No documents need reprocessing.");
    return;
  }

  console.log(`Reprocessing ${docs.length} document(s)...`);
  for (const doc of docs) {
    console.log(`  → ${doc.name} (${doc.id}) [${doc.processingStatus}]`);
    try {
      await processDocument(doc.id);
      const updated = await prisma.document.findUnique({
        where: { id: doc.id },
        include: { _count: { select: { chunks: true } } },
      });
      console.log(`     ✅ status: ${updated?.processingStatus}, chunks: ${updated?._count.chunks ?? 0}`);
    } catch (err) {
      console.error(`     ❌ Failed:`, err);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
