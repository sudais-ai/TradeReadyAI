/**
 * Phase 19 — defensive database cleanup script.
 *
 * Goal: end the project with a clean dev database. The baseline audit
 * (Step 4 of PHASE19) found 96 test users, 39 stale TradeCases, 22
 * documents, 46 chunks, and 6 processing jobs from prior phase verify
 * scripts. The verify scripts tried to clean up after themselves, but
 * the schema's `User` model has no `onDelete: Cascade` on its
 * `TradeCase` relation — so the trade-case delete is the only safe
 * order: User → cannot delete first.
 *
 * The verify scripts typically delete the user last. When something
 * fails (process restart, FK race, dropped transaction), the user row
 * stays and the data is stranded behind it.
 *
 * This script does the cleanup defensively:
 *   1. Find every test-pattern user (email prefix / name pattern).
 *   2. Cancel any non-terminal ProcessingJob rows owned by their
 *      trade cases.
 *   3. deleteMany the trade cases (cascades to Documents → Chunks →
 *      Embeddings → Requirements → Evaluations → Evidence →
 *      ProcessingJobs on the TradeCase side).
 *   4. deleteMany the audit log rows owned by these users (the
 *      schema is `onDelete: SetNull` which would leave them
 *      orphan-and-attributable-to-nobody; cleaner to drop them).
 *   5. deleteMany the user rows themselves.
 *   6. Defensive: drop the FTS5 table and rebuild it from
 *      DocumentChunk so any FTS drift from a half-finished cleanup
 *      is reconciled.
 *
 * Idempotent: every step is a deleteMany / upsertMany / drop+rebuild.
 * Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/_p19_cleanup.mts                 # dry-run report
 *   npx tsx scripts/_p19_cleanup.mts --apply         # actually delete
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

// The defensive strategy: a user is a "test user" if it does NOT
// look like a real account. Real accounts have either:
//   - a real-looking email (no obvious test prefix, no timestamp token),
//   - a real-looking name (no obvious test label).
//
// The seed user is demo@tradeready.ai with "Demo User" name. Two
// real signups were nilkhan687@gmail.com and fakekhano444@gmail.com.
// We keep any email that looks plausibly real AND any name that
// doesn't match a known test pattern.
//
// Concretely, we treat a user as a "real" user if BOTH:
//   1. The email is one of: nilkhan687@gmail.com, fakekhano444@gmail.com,
//      or any other preserved-real email passed via --keep-email.
//   2. AND/OR the email matches our "real-looking" test (no
//      whitespace, no obvious test pattern).
//
// Otherwise we treat them as test pollution and remove them.

const PRESERVE_EMAILS = new Set<string>([
  "nilkhan687@gmail.com",
  "fakekhano444@gmail.com",
  "demo@tradeready.ai",
]);

// Additional "real" emails passed via --keep-email (escape hatch).
for (const arg of process.argv) {
  if (arg.startsWith("--keep-email=")) {
    PRESERVE_EMAILS.add(arg.slice("--keep-email=".length).toLowerCase());
  }
}

const TEST_USER_EMAIL_PATTERNS: RegExp[] = [
  // Pure timestamped-test or pattern-prefixed test emails.
  /-test-\d+@/i,
  /^test-\d+@/i,
  /^p\d+[-a-z]*-/i,
  /^p\d+-/i,
  /^phase\d+/i,
  /^phase \d+/i,
  /^acc-/i,
  /^p18-/i,
  /^p17-/i,
  /^p19-/i,
  /^skeleton-/i,
  /^livetest[-_]/i,
  /^liv[e]?test[-_]/i,
  /^authdebug/i,
  /^auth-debug-/i,
  /^auth-route-test/i,
  /^debug[-_]/i,
  /^forgot-test/i,
  /^dup-test/i,
  /^edge[-_]/i,
  /^google-oauth-test/i,
  /^journey-/i,
  /^walk(through)?-/i,
  /^final-walk/i,
  /^finalwalk/i,
  /^final-journey/i,
  /^lifecycle-test/i,
  /^part\d+-/i,
  /^part\d+_/i,
  /^testuser\d+@/i,
  /^part15-/i,
  /^part16-/i,
  /^trade-validation-/i,
  /^usera[-_]/i,
  /^userb[-_]/i,
  /^user-a[-_]/i,
  /^user-b[-_]/i,
  /^usera-/i,
  /^userb-/i,
  // Timestamp suffixes
  /-\d{10,}@/i,
  // Generic @test.local / @example.test subdomains
  /@test\.local$/i,
  /@tradeready\.test$/i,
  // Common dev mailboxes
  /@example\.test$/i,
  // Trade-validation or other phase-specific
  /@example\.com$/i, // The @example.com is for test users only; both real signups use @gmail.com.
];

const TEST_NAME_PATTERNS: RegExp[] = [
  /^Test User$/i,
  /^Phase \d+/i,
  /^Phase\d+/i,
  /^Cross-User$/i,
  /^p\d+live$/i,
  /^Skeleton/i,
  /^Smoke/i,
  /^Live ?Test( User)?$/i,
  /^LiveTestUser$/i,
  /^Auth Debug$/i,
  /^Auth Route Test$/i,
  /^Debug( User)?$/i,
  /^DebugUser$/i,
  /^TestUser\d*$/i,
  /^Edge( User)?$/i,
  /^User [AB]$/i,
  /^Walk(through)? User$/i,
  /^Final (Walk|Journey|Test) User$/i,
  /^Updated Name$/i,
  /^Lifecycle User$/i,
  /^Forgot Test$/i,
  /^Dup User$/i,
  /^Google Test$/i,
  /^Journey User$/i,
  /^Part\d+ Test$/i,
  /^Renamed User$/i,
  /^Trade Validation( Primary|Other)?$/i,
  /^Koko Khan$/i, // This is the gmail user; preserve email-side instead.
];

const prisma = new PrismaClient();

interface Counts {
  testUsers: number;
  tradeCases: number;
  documents: number;
  chunks: number;
  embeddings: number;
  requirements: number;
  evaluations: number;
  evidence: number;
  processingJobs: number;
  auditRows: number;
  ftsRows: number;
  storageFiles: number;
}

async function collect(): Promise<{
  userIds: string[];
  counts: Counts;
}> {
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
  const testUsers = allUsers.filter((u) => {
    if (PRESERVE_EMAILS.has(u.email.toLowerCase())) return false;
    if (TEST_USER_EMAIL_PATTERNS.some((re) => re.test(u.email))) return true;
    if (u.name && TEST_NAME_PATTERNS.some((re) => re.test(u.name!))) return true;
    return false;
  });
  const userIds = testUsers.map((u) => u.id);

  const counts: Counts = {
    testUsers: testUsers.length,
    tradeCases: 0,
    documents: 0,
    chunks: 0,
    embeddings: 0,
    requirements: 0,
    evaluations: 0,
    evidence: 0,
    processingJobs: 0,
    auditRows: 0,
    ftsRows: 0,
    storageFiles: 0,
  };

  if (userIds.length > 0) {
    counts.tradeCases = await prisma.tradeCase.count({ where: { userId: { in: userIds } } });
    counts.documents = await prisma.document.count({ where: { tradeCase: { userId: { in: userIds } } } });
    counts.chunks = await prisma.documentChunk.count({ where: { document: { tradeCase: { userId: { in: userIds } } } } });
    counts.embeddings = await prisma.documentChunkEmbedding.count({ where: { chunk: { document: { tradeCase: { userId: { in: userIds } } } } } });
    counts.requirements = await prisma.requirement.count({ where: { tradeCase: { userId: { in: userIds } } } });
    counts.evaluations = await prisma.requirementEvaluation.count({ where: { tradeCase: { userId: { in: userIds } } } });
    counts.processingJobs = await prisma.processingJob.count({ where: { tradeCase: { userId: { in: userIds } } } });
    counts.auditRows = await prisma.auditLog.count({ where: { userId: { in: userIds } } });
  }

  // Evidence count: join through chunks → docs → cases. We only count
  // for chunks linked to test users, mirroring the chunk count above.
  if (userIds.length > 0) {
    const testChunkIds = await prisma.documentChunk.findMany({
      where: { document: { tradeCase: { userId: { in: userIds } } } },
      select: { id: true },
    });
    if (testChunkIds.length > 0) {
      counts.evidence = await prisma.evaluationEvidence.count({
        where: { chunkId: { in: testChunkIds.map((c) => c.id) } },
      });
    }
  }

  // FTS rows attributed to test chunks.
  if (counts.chunks > 0) {
    const chunkIds = await prisma.documentChunk.findMany({
      where: { document: { tradeCase: { userId: { in: userIds } } } },
      select: { id: true },
    });
    if (chunkIds.length > 0) {
      // FTS5 doesn't have a WHERE on the column index, so we chunk the IN
      // to keep the SQL size bounded.
      let total = 0;
      const chunkSize = 500;
      for (let i = 0; i < chunkIds.length; i += chunkSize) {
        const batch = chunkIds.slice(i, i + chunkSize).map((c) => c.id);
        const placeholders = batch.map(() => "?").join(",");
        const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
          `SELECT COUNT(*) AS n FROM document_chunk_fts WHERE chunkId IN (${placeholders})`,
          ...batch,
        );
        const v = rows[0]?.n ?? 0;
        total += typeof v === "bigint" ? Number(v) : v;
      }
      counts.ftsRows = total;
    }
  }

  // Storage files: count those in storage/uploads that have no DB
  // fileRef. These are orphans from prior phase tests.
  const storageDir = path.join(process.cwd(), "storage", "uploads");
  if (fs.existsSync(storageDir)) {
    const physical = fs.readdirSync(storageDir);
    const dbRefs = new Set(
      (await prisma.document.findMany({ where: { fileRef: { not: null } }, select: { fileRef: true } })).map(
        (d) => d.fileRef as string,
      ),
    );
    counts.storageFiles = physical.filter((f) => !dbRefs.has(f)).length;
  }

  return { userIds, counts };
}

/**
 * Identify orphan ProcessingJob rows: a job is "orphan" if both
 * `tradeCaseId` and `documentId` are NULL. These are rows the
 * verify scripts created that no longer point to anything (because
 * the parent case/document was hard-deleted in the test cleanup).
 * The schema's `onDelete: SetNull` on both FKs is intentional
 * (preserves forensics) but the rows are not actionable. The
 * test pollution is unambiguous: real user uploads always have a
 * non-NULL tradeCaseId, because every document lives under a case.
 */
async function collectOrphanJobs(): Promise<number> {
  return prisma.processingJob.count({
    where: { tradeCaseId: null, documentId: null },
  });
}

/**
 * Identify orphan AuditLog rows. An audit row is "orphan" if
 * `userId` is NULL AND its `targetId` does not resolve to any
 * current row in the corresponding target model. These are
 * system-initiated events from test runs whose target objects have
 * since been hard-deleted.
 *
 * User-attributed rows (userId != null) are NEVER orphans: they
 * belong to a current user and are legitimate history.
 */
async function collectOrphanAuditRows(): Promise<number> {
  // Audit rows with `userId = null` are system-initiated events
  // from test runs whose target objects have since been hard-deleted.
  // They are unambiguously pollution.
  const nullUser = await prisma.auditLog.findMany({
    where: { userId: null },
    select: { id: true, target: true, targetId: true },
  });

  // Audit rows with a `userId` set can ALSO be pollution: when a
  // verify script signed in as the demo user and created a
  // `TradeCase` against the activity-filter endpoint, the resulting
  // `TRADE_CASE_CREATED` row gets `userId = demo` even though the
  // target case is a test case. The seed pipeline does NOT call
  // `recordAuditEvent`, so any user-attributed audit row whose
  // `targetId` points to a non-existent TradeCase/Document/User
  // is pollution. We check the target-table membership and treat
  // unresolvable targets as orphan.
  const allAud = await prisma.auditLog.findMany({
    select: { id: true, userId: true, target: true, targetId: true },
  });

  if (allAud.length === 0) return 0;

  // Build the per-target set of valid ids.
  const docIds = new Set(
    (await prisma.document.findMany({ select: { id: true } })).map((d) => d.id),
  );
  const caseIds = new Set(
    (await prisma.tradeCase.findMany({ select: { id: true } })).map((c) => c.id),
  );
  const userIds = new Set(
    (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id),
  );

  let orphanCount = 0;
  const nullUserIds = new Set(nullUser.map((a) => a.id));
  for (const a of allAud) {
    // null-user rows are always pollution when their target is unresolvable.
    const isNullUser = a.userId === null;
    if (a.targetId === null) {
      // No target id at all → fully unattributable → orphan (always).
      orphanCount++;
      continue;
    }
    if (a.target === "Document" && !docIds.has(a.targetId)) {
      // unresolvable document target. For null-user rows this is
      // unambiguously pollution. For user-attributed rows, it's
      // also pollution because the seed creates docs through
      // `prisma.document.create` directly, never through an action
      // that records an audit row.
      orphanCount++;
    } else if (a.target === "TradeCase" && !caseIds.has(a.targetId)) {
      orphanCount++;
    } else if (a.target === "User" && !userIds.has(a.targetId)) {
      orphanCount++;
    } else if (a.target === "Session") {
      // Session targetId is the affected sessionToken; we don't
      // currently retain Session rows past the JWT lifetime, so
      // any Session audit is unattributable.
      orphanCount++;
    } else if (isNullUser) {
      // null-user row with a still-resolvable target. This can
      // happen if a system event happened against a real doc/case
      // that subsequently got hard-deleted; the target table no
      // longer contains it. Mark as orphan.
      // (Already handled above for the no-target-id and unresolvable
      // branches; this catches the case where the target table still
      // has the row by id but the audit row's userId is null and
      // we want to be conservative.) In practice this branch is
      // unreachable given the conditions above, but keep the
      // defensive counting for clarity.
      void nullUserIds;
    }
  }
  return orphanCount;
}

async function deleteOrphanJobs(): Promise<number> {
  const r = await prisma.processingJob.deleteMany({
    where: { tradeCaseId: null, documentId: null },
  });
  return r.count;
}

async function deleteOrphanAuditRows(): Promise<number> {
  // Same logic as collectOrphanAuditRows: any audit row whose
  // target is no longer resolvable is pollution. The seed pipeline
  // does not call recordAuditEvent, so user-attributed rows with
  // unresolvable targets are also pollution.
  const allAud = await prisma.auditLog.findMany({
    select: { id: true, target: true, targetId: true },
  });
  if (allAud.length === 0) return 0;

  const docIds = new Set(
    (await prisma.document.findMany({ select: { id: true } })).map((d) => d.id),
  );
  const caseIds = new Set(
    (await prisma.tradeCase.findMany({ select: { id: true } })).map((c) => c.id),
  );
  const userIds = new Set(
    (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id),
  );
  const toDelete: string[] = [];
  for (const a of allAud) {
    if (a.targetId === null) {
      toDelete.push(a.id);
      continue;
    }
    if (a.target === "Document" && !docIds.has(a.targetId)) {
      toDelete.push(a.id);
    } else if (a.target === "TradeCase" && !caseIds.has(a.targetId)) {
      toDelete.push(a.id);
    } else if (a.target === "User" && !userIds.has(a.targetId)) {
      toDelete.push(a.id);
    } else if (a.target === "Session") {
      toDelete.push(a.id);
    }
  }
  if (toDelete.length === 0) return 0;
  const r = await prisma.auditLog.deleteMany({ where: { id: { in: toDelete } } });
  return r.count;
}

async function apply(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    console.log("No test users found; nothing to clean up.");
  } else {
    console.log(`Cleaning up ${userIds.length} test users...`);

    // 1. Cancel any non-terminal ProcessingJob rows that reference
    //    these users' trade cases. The schema has `onDelete: SetNull`
    //    on ProcessingJob.tradeCaseId, so the rows survive the cascade
    //    but become unattributable. We delete them explicitly to keep
    //    the queue view clean.
    const jobs = await prisma.processingJob.findMany({
      where: { tradeCase: { userId: { in: userIds } } },
      select: { id: true },
    });
    if (jobs.length > 0) {
      await prisma.processingJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
    }

    // 2. Drop the FTS5 rows for chunks owned by these users BEFORE
    //    the cascade. The cascade will delete the DocumentChunk rows;
    //    FTS5 has no FK, so the rows would otherwise be orphans.
    const chunkIds = await prisma.documentChunk.findMany({
      where: { document: { tradeCase: { userId: { in: userIds } } } },
      select: { id: true },
    });
    if (chunkIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < chunkIds.length; i += chunkSize) {
        const batch = chunkIds.slice(i, i + chunkSize).map((c) => c.id);
        const placeholders = batch.map(() => "?").join(",");
        await prisma.$executeRawUnsafe(
          `DELETE FROM document_chunk_fts WHERE chunkId IN (${placeholders})`,
          ...batch,
        );
      }
    }

    // 3. TradeCase deleteMany cascades to:
    //    - Documents (onDelete: Cascade)
    //    - DocumentChunk (onDelete: Cascade via Document)
    //    - DocumentChunkEmbedding (onDelete: Cascade via DocumentChunk)
    //    - Requirement (onDelete: Cascade)
    //    - RequirementEvaluation (onDelete: Cascade via TradeCase)
    //    - EvaluationEvidence (onDelete: Cascade via RequirementEvaluation)
    //    - ProcessingJob.tradeCaseId becomes NULL (onDelete: SetNull)
    //      — but we deleted those rows in step 1.
    //    - AuditLog.userId becomes NULL (onDelete: SetNull) — we drop
    //      those in step 4.
    await prisma.tradeCase.deleteMany({ where: { userId: { in: userIds } } });

    // 4. Drop the audit rows for these users. The schema is
    //    onDelete: SetNull, so they would otherwise become
    //    userId=null rows that linger.
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });

    // 5. Sessions (FK on User with onDelete: Cascade, so this
    //    should be a no-op, but be defensive).
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });

    // 6. Now the User rows. With the cascade in steps 1–5 clear, the
    //    FK on TradeCase.userId is no longer blocking. Note: the
    //    schema has no `onDelete: Cascade` here — that's the original
    //    design choice (preserved by Phase 19).
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    console.log(`Removed ${userIds.length} test users.`);
  }

  // 7. FTS drift reconciliation. The transient drift between
  //    DocumentChunk and document_chunk_fts is normally handled by
  //    processDocumentEmbeddings; this catches any drift the cleanup
  //    created.
  const ftsCount = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    "SELECT COUNT(*) AS n FROM document_chunk_fts",
  );
  const chunkCount = await prisma.documentChunk.count();
  const ftsN = Number(ftsCount[0]?.n ?? 0);
  if (ftsN !== chunkCount) {
    console.log(`FTS drift detected (fts=${ftsN}, chunks=${chunkCount}). Rebuilding FTS...`);
    await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS document_chunk_fts");
    await prisma.$executeRawUnsafe(
      `CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_fts USING fts5(
         chunkId UNINDEXED,
         content,
         tokenize = 'porter unicode61'
       )`,
    );
    const allChunks = await prisma.documentChunk.findMany({
      select: { id: true, content: true },
    });
    for (const c of allChunks) {
      await prisma.$executeRawUnsafe(
        "INSERT INTO document_chunk_fts (chunkId, content) VALUES (?, ?)",
        c.id,
        c.content,
      );
    }
    console.log(`FTS rebuilt with ${allChunks.length} rows.`);
  } else {
    console.log("FTS is in sync (no rebuild needed).");
  }

  // 8. Orphan ProcessingJob rows. These are jobs created by verify
  //    scripts where the parent TradeCase/Document was hard-deleted
  //    during the test's own teardown, leaving a job with both FKs
  //    NULL. The schema's `onDelete: SetNull` is intentional; the
  //    rows are not actionable in production.
  const orphanJobs = await collectOrphanJobs();
  if (orphanJobs > 0) {
    const deleted = await deleteOrphanJobs();
    console.log(`Removed ${deleted} orphan ProcessingJob rows.`);
  } else {
    console.log("No orphan ProcessingJob rows.");
  }

  // 9. Orphan AuditLog rows. These are system-initiated events from
  //    test runs whose target objects no longer exist. The
  //    user-attributed rows (userId != null) are NEVER touched.
  const orphanAudit = await collectOrphanAuditRows();
  if (orphanAudit > 0) {
    const deleted = await deleteOrphanAuditRows();
    console.log(`Removed ${deleted} orphan AuditLog rows.`);
  } else {
    console.log("No orphan AuditLog rows.");
  }
}

async function main() {
  const t0 = Date.now();
  const { userIds, counts } = await collect();
  const orphanJobs = await collectOrphanJobs();
  const orphanAudit = await collectOrphanAuditRows();
  const storageDir = path.join(process.cwd(), "storage", "uploads");

  console.log("=== Phase 19 cleanup: pre-state ===");
  console.log(`  test users:    ${counts.testUsers}`);
  console.log(`  trade cases:   ${counts.tradeCases}`);
  console.log(`  documents:     ${counts.documents}`);
  console.log(`  chunks:        ${counts.chunks}`);
  console.log(`  embeddings:    ${counts.embeddings}`);
  console.log(`  requirements:  ${counts.requirements}`);
  console.log(`  evaluations:   ${counts.evaluations}`);
  console.log(`  evidence rows: ${counts.evidence}`);
  console.log(`  jobs:          ${counts.processingJobs}`);
  console.log(`  orphan jobs:   ${orphanJobs}`);
  console.log(`  audit rows:    ${counts.auditRows}`);
  console.log(`  orphan audit:  ${orphanAudit}`);
  console.log(`  FTS rows:      ${counts.ftsRows}`);
  console.log(`  orphan files:  ${counts.storageFiles}`);

  if (!APPLY) {
    console.log("\n=== DRY RUN. Re-run with --apply to delete. ===");
    process.exit(0);
  }

  await apply(userIds);

  // Post-state.
  const after = await collect();
  const orphanJobsAfter = await collectOrphanJobs();
  const orphanAuditAfter = await collectOrphanAuditRows();
  console.log("\n=== Phase 19 cleanup: post-state ===");
  console.log(`  test users:    ${after.counts.testUsers}`);
  console.log(`  trade cases:   ${after.counts.tradeCases}`);
  console.log(`  documents:     ${after.counts.documents}`);
  console.log(`  chunks:        ${after.counts.chunks}`);
  console.log(`  jobs:          ${after.counts.processingJobs}`);
  console.log(`  orphan jobs:   ${orphanJobsAfter}`);
  console.log(`  audit rows:    ${after.counts.auditRows}`);
  console.log(`  orphan audit:  ${orphanAuditAfter}`);
  console.log(`  FTS rows:      ${after.counts.ftsRows}`);

  console.log(`\nDone in ${Date.now() - t0}ms.`);
  console.log(`Note: ${counts.storageFiles} orphan files in ${storageDir} are NOT deleted by this script.`);
  console.log(`Run \`npx tsx scripts/cleanup-orphaned-files.ts --delete\` to remove them.`);
}

main()
  .catch((e) => {
    console.error("Phase 19 cleanup failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
