import { prisma } from "../src/lib/db/prisma";
import { generateChunks } from "../src/lib/document-processing/chunking-service";
import { normalizeText } from "../src/lib/document-processing/text-utils";

async function main() {
  // 1. Verify DocumentChunk table exists
  const totalChunks = await prisma.documentChunk.count();
  console.log("DocumentChunk table exists, total rows:", totalChunks);

  // 2. Find a document with extractedText
  const doc = await prisma.document.findFirst({
    where: { extractedText: { not: null } },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  });

  if (doc) {
    console.log("\nDocument found:", doc.name);
    console.log("Processing status:", doc.processingStatus);
    console.log("Chunks in DB:", doc.chunks.length);
    if (doc.chunks.length > 0) {
      const first = doc.chunks[0];
      const last = doc.chunks[doc.chunks.length - 1];
      console.log("First chunk index:", first.chunkIndex);
      console.log("First chunk chars:", first.characterCount);
      console.log("First chunk preview:", first.content.slice(0, 120));
      console.log("Last chunk index:", last.chunkIndex);
    } else {
      console.log("Status shows:", doc.processingStatus, "— this doc was processed before chunking was added.");
      console.log("Retrigger processing to generate chunks.");
    }
  } else {
    console.log("\nNo processed document found — testing chunking on synthetic text");
    const sampleText = [
      "International trade requires careful planning.",
      "Document preparation is critical for successful cross-border transactions.",
      "Customs clearance involves multiple steps.",
      "Import duties and taxes vary by destination country.",
      "Compliance with local regulations is essential.",
      "Proper documentation speeds up customs processing significantly.",
      "Final checks before shipment ensure smooth delivery.",
    ].join("\n\n");

    const chunks = generateChunks(normalizeText(sampleText));
    console.log("Generated chunks from synthetic text:", chunks.length);
    for (const c of chunks) {
      console.log(`  Chunk ${c.index}: ${c.characterCount} chars — ${c.content.slice(0, 60)}`);
    }
  }

  // 3. Check cascade behavior: find a document and see if deleting would cascade
  const firstDoc = await prisma.document.findFirst({ include: { chunks: true } });
  if (firstDoc) {
    console.log(`\nDocument '${firstDoc.name}' has ${firstDoc.chunks.length} chunks (cascade-linked)`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
