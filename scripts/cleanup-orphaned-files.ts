/**
 * Safe cleanup utility for orphaned physical files.
 * 
 * This script identifies physical files in storage that don't have corresponding
 * database records and can optionally delete them.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-orphaned-files.ts --dry-run   # Preview what would be deleted
 *   npx tsx scripts/cleanup-orphaned-files.ts --delete     # Actually delete orphaned files
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const doDelete = args.includes("--delete");
  
  if (!dryRun && !doDelete) {
    console.log("Usage:");
    console.log("  npx tsx scripts/cleanup-orphaned-files.ts --dry-run   # Preview what would be deleted");
    console.log("  npx tsx scripts/cleanup-orphaned-files.ts --delete     # Actually delete orphaned files");
    process.exit(1);
  }
  
  if (dryRun && doDelete) {
    console.error("Error: Cannot use both --dry-run and --delete");
    process.exit(1);
  }
  
  console.log(`=== Orphaned File Cleanup ${dryRun ? "(DRY RUN)" : "(DELETE MODE)"} ===\n`);
  
  const storageDir = path.join(process.cwd(), "storage", "uploads");
  
  // 1. Get all physical files
  let physicalFiles: string[] = [];
  try {
    physicalFiles = fs.readdirSync(storageDir);
  } catch {
    console.error("Storage directory does not exist or is not accessible.");
    process.exit(1);
  }
  
  console.log(`Physical files in storage: ${physicalFiles.length}`);
  
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
  console.log(`DB records with fileRef: ${docsWithFileRef.length}`);
  
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
  const orphanedFiles: Array<{name: string; size: number; modified: Date}> = [];
  
  for (const file of physicalFiles) {
    if (!dbFileRefs.has(file)) {
      orphanedFilesCount++;
      const filePath = path.join(storageDir, file);
      const stats = fs.statSync(filePath);
      orphanedFiles.push({
        name: file,
        size: stats.size,
        modified: stats.mtime,
      });
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
  
  // 6. Delete if requested
  if (doDelete && orphanedFilesCount > 0) {
    console.log("\n=== Deleting orphaned files ===");
    let deleted = 0;
    let failed = 0;
    
    for (const file of orphanedFiles) {
      const filePath = path.join(storageDir, file.name);
      try {
        fs.unlinkSync(filePath);
        console.log(`  ✅ Deleted: ${file.name}`);
        deleted++;
      } catch (e) {
        console.error(`  ❌ Failed to delete ${file.name}:`, e);
        failed++;
      }
    }
    
    console.log(`\nDeleted: ${deleted}, Failed: ${failed}`);
  } else if (dryRun && orphanedFilesCount > 0) {
    console.log("\n--- Run with --delete to actually remove these files ===");
  }
  
  await prisma.$disconnect();
}

main().catch(() => {
  console.error("Cleanup failed");
  process.exit(1);
});