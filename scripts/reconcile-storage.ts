import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Storage Reconciliation Report ===\n");

  const storageDir = path.join(process.cwd(), "storage", "uploads");

  // 1. Get all physical files
  let physicalFiles: string[] = [];
  try {
    physicalFiles = fs.readdirSync(storageDir);
  } catch (e) {
    console.log("Storage directory does not exist or is not accessible.");
    physicalFiles = [];
  }

  console.log(`Physical files in storage: ${physicalFiles.length}`);
  if (physicalFiles.length > 0) {
    physicalFiles.forEach(f => console.log(`  - ${f}`));
  }

  // 2. Get all documents with fileRef
  const documents = await prisma.document.findMany({
    select: {
      id: true,
      name: true,
      tradeCaseId: true,
      fileRef: true,
      mimeType: true,
      size: true,
      processingStatus: true,
      embeddingStatus: true,
      createdAt: true,
    }
  });

  const docsWithFileRef = documents.filter(d => d.fileRef);
  console.log(`\nDB records with fileRef: ${docsWithFileRef.length}`);

  // 3. Check for DB records pointing to missing physical files
  console.log("\n--- Missing Physical Files (DB has fileRef but file doesn't exist) ---");
  let missingFilesCount = 0;
  for (const doc of docsWithFileRef) {
    const filePath = path.join(storageDir, doc.fileRef!);
    if (!fs.existsSync(filePath)) {
      missingFilesCount++;
      console.log(`  ❌ MISSING: ${doc.fileRef}`);
      console.log(`     Document: ${doc.name} (${doc.id})`);
      console.log(`     Trade Case: ${doc.tradeCaseId}`);
      console.log(`     Type: ${doc.mimeType}, Size: ${doc.size}`);
      console.log(`     Processing Status: ${doc.processingStatus}`);
      console.log(`     Embedding Status: ${doc.embeddingStatus}`);
      console.log(`     Created: ${doc.createdAt}`);
    }
  }
  if (missingFilesCount === 0) {
    console.log("  ✅ All DB records with fileRef have corresponding physical files.");
  }

  // 4. Check for physical files without DB records (orphaned files)
  console.log("\n--- Orphaned Physical Files (file exists but no DB record) ---");
  const dbFileRefs = new Set(docsWithFileRef.map(d => d.fileRef!));
  let orphanedFilesCount = 0;
  for (const file of physicalFiles) {
    if (!dbFileRefs.has(file)) {
      orphanedFilesCount++;
      const filePath = path.join(storageDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  ❌ ORPHANED: ${file}`);
      console.log(`     Size: ${stats.size} bytes`);
      console.log(`     Modified: ${stats.mtime}`);
    }
  }
  if (orphanedFilesCount === 0) {
    console.log("  ✅ No orphaned physical files found.");
  }

  // 5. Summary
  console.log("\n=== Summary ===");
  console.log(`Physical files: ${physicalFiles.length}`);
  console.log(`DB records with fileRef: ${docsWithFileRef.length}`);
  console.log(`Missing physical files: ${missingFilesCount}`);
  console.log(`Orphaned physical files: ${orphanedFilesCount}`);

  // 6. Check for documents without fileRef but with processingStatus
  console.log("\n--- Documents with processing status but no fileRef ---");
  const docsWithStatusNoFile = documents.filter(d => d.processingStatus && !d.fileRef);
  console.log(`Count: ${docsWithStatusNoFile.length}`);
  for (const doc of docsWithStatusNoFile) {
    console.log(`  - ${doc.name} (${doc.id}): status=${doc.processingStatus}, embeddingStatus=${doc.embeddingStatus}`);
  }

  // 7. Check for documents with fileRef but no processing status
  console.log("\n--- Documents with fileRef but no processing status ---");
  const docsWithFileNoStatus = documents.filter(d => d.fileRef && !d.processingStatus);
  console.log(`Count: ${docsWithFileNoStatus.length}`);
  for (const doc of docsWithFileNoStatus) {
    console.log(`  - ${doc.name} (${doc.id}): fileRef=${doc.fileRef}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);