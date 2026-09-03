// Phase 7 — Database Foundation & Hardening verification.
//
// Database-level regression test for Phase 7. Confirms the new index
// migration is applied, the schema is in sync, all critical CRUD and
// cross-tenant paths work, and the Phase 6 transaction helper rolls back
// atomically.
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/verify-phase7.mts <cookies-file>

import { spawnSync } from "child_process";
import bcrypt from "bcryptjs";

import { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — direct .ts import is intentional; this script is run via tsx.
import { withTransaction } from "../src/lib/db/transaction.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { ftsUpsertMany, ftsDeleteMany } from "../src/lib/rag/keyword-retriever.ts";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const skipped: string[] = [];

function ok(name: string, cond: boolean, info?: unknown): void {
  if (cond) {
    console.log(`  [PASS] ${name}`);
    pass++;
  } else {
    let infoStr = "";
    if (info !== undefined) {
      try {
        infoStr =
          " -- " +
          (typeof info === "string"
            ? info
            : JSON.stringify(info, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
      } catch {
        infoStr = " -- (unserializable info)";
      }
    }
    console.log(`  [FAIL] ${name}${infoStr}`);
    fail++;
  }
}
function info(msg: string): void {
  console.log(`  [INFO] ${msg}`);
}

const cookiesFile = process.argv[2];
if (!cookiesFile) {
  console.error("Usage: node scripts/verify-phase7.mjs <cookies-file>");
  process.exit(1);
}

const repoRoot = process.cwd().replace(/\\/g, "/");
const tsxCli = repoRoot + "/node_modules/tsx/dist/cli.mjs";

// IDs created in step 6 and consumed in steps 7-9. Kept module-scoped so
// step 9 can verify cascade deletion of the same rows.
let phase7CaseId: string | null = null;
let phase7DocId: string | null = null;
let phase7ChunkId: string | null = null;
let phase7EvalId: string | null = null;
let phase7FixtureUserId: string | null = null;

async function main() {
  console.log("\n=== PHASE 7 LIVE REGRESSION — Database Foundation ===\n");

  // ─── 1. Database connectivity ──────────────────────────────────────────────
  console.log("▶ 1. Database connectivity");
  {
    const rows = await prisma.$queryRawUnsafe<{ ok: string }[]>(`SELECT CAST(1 AS TEXT) AS ok`);
    ok("SELECT 1 returns a row", Array.isArray(rows) && rows[0]?.ok === "1", `rows=${rows.length}`);
  }

  // ─── 2. Prisma client init ────────────────────────────────────────────────
  console.log("\n▶ 2. Prisma client init");
  let userCount = 0;
  {
    userCount = await prisma.user.count();
    ok("prisma.user.count() > 0", userCount > 0, `count=${userCount}`);
    info(`Live user count: ${userCount}`);
  }

  // ─── 3. Schema synchronization ────────────────────────────────────────────
  console.log("\n▶ 3. Schema synchronization (PRAGMA-derived)");
  {
    const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
    );
    // The original Phase 7 invariant: these 10 tables must exist.
    // Phase 13 (and later) intentionally added: AuditLog, ProcessingJob,
    // and the FTS5 virtual table + its internal shadow tables. The
    // current schema is a strict superset of the original, so we assert
    // the original 10 are present (every expected name found in the
    // actual set) rather than equality.
    const expected = [
      "User", "TradeCase", "Product", "Document", "DocumentChunk",
      "DocumentChunkEmbedding", "Requirement", "RequirementEvaluation",
      "EvaluationEvidence", "Session",
    ];
    const got = new Set(tables.map((t) => t.name));
    const missing = expected.filter((t) => !got.has(t));
    ok(
      "All 10 original Phase 7 tables present (schema is a superset)",
      missing.length === 0,
      `missing=${missing.join(",")} extra=${[...got].filter((t) => !expected.includes(t)).join(",")}`,
    );
  }

  // ─── 4. Migration state ───────────────────────────────────────────────────
  console.log("\n▶ 4. Migration state");
  {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`
    );
    const applied = rows.map((r) => r.migration_name);
    info(`Applied migrations: ${applied.length} (${applied.join(", ")})`);
    ok("At least 8 migrations applied (7 original + Phase 7)", applied.length >= 8, `count=${applied.length}`);
    ok("Phase 7 index migration applied",
       applied.includes("20260828120000_add_ownership_and_evidence_indexes"),
       applied.join(","));
  }

  // ─── 5. User CRUD ─────────────────────────────────────────────────────────
  console.log("\n▶ 5. User CRUD");
  const testEmail = `phase7-${Date.now()}@example.com`;
  {
    const passwordHash = await bcrypt.hash("Phase7Test123!", 10);
    const u = await prisma.user.create({
      data: { email: testEmail, name: "Phase 7 Test", passwordHash },
    });
    ok("Create user returns a UUID", /^[0-9a-f-]{36}$/.test(u.id), u.id);

    const got = await prisma.user.findUnique({ where: { id: u.id } });
    ok("Read user back by id", got?.email === testEmail);

    await prisma.user.update({ where: { id: u.id }, data: { name: "Phase 7 Renamed" } });
    const renamed = await prisma.user.findUnique({ where: { id: u.id } });
    ok("Update user name", renamed?.name === "Phase 7 Renamed");

    await prisma.user.delete({ where: { id: u.id } });
    const gone = await prisma.user.findUnique({ where: { id: u.id } });
    ok("Delete user", gone === null);
  }

  // ─── 6. TradeCase + children chain ────────────────────────────────────────
  console.log("\n▶ 6. TradeCase + Product + Document + Chunk + Embedding + Requirement + Evaluation + Evidence");
  {
    // Create a fixture user
    const fixEmail = `phase7-fixture-${Date.now()}@example.com`;
    const fixUser = await prisma.user.create({
      data: { email: fixEmail, name: "Phase 7 Fixture", passwordHash: await bcrypt.hash("x", 10) },
    });

    // Create a full case tree
    const tradeCase = await prisma.tradeCase.create({
      data: {
        userId: fixUser.id,
        origin: "Phase7Origin",
        destination: "Phase7Destination",
        product: { create: { name: "Phase7Product", category: "Test" } },
        requirements: { create: [{ title: "Phase7 Requirement" }] },
      },
      include: { product: true, requirements: true },
    });
    const doc = await prisma.document.create({
      data: { name: "phase7-doc.txt", tradeCaseId: tradeCase.id, status: "Uploaded" },
    });
    const chunk = await prisma.documentChunk.create({
      data: { documentId: doc.id, chunkIndex: 0, content: "phase7 chunk", characterCount: 12 },
    });
    // Phase 18: keep the FTS5 keyword index in sync with the DocumentChunk
    // table. Without this, the chunk row exists in `DocumentChunk` but
    // never in `document_chunk_fts`, leaving the FTS count out of sync
    // with the chunk count (visible as negative drift on /api/health).
    await ftsUpsertMany([{ chunkId: chunk.id, content: chunk.content }]);
    await prisma.documentChunkEmbedding.create({
      data: {
        chunkId: chunk.id,
        provider: "phase7",
        model: "test",
        dimensions: 1,
        vector: JSON.stringify([0.0]),
      },
    });
    const req = tradeCase.requirements[0];
    const evalRow = await prisma.requirementEvaluation.create({
      data: { requirementId: req.id, tradeCaseId: tradeCase.id, status: "DONE" },
    });
    await prisma.evaluationEvidence.create({
      data: { evaluationId: evalRow.id, chunkId: chunk.id, reason: "phase7 evidence" },
    });

    // Re-read with full includes
    const tree = await prisma.tradeCase.findFirst({
      where: { id: tradeCase.id },
      include: {
        product: true,
        requirements: { include: { evaluation: { include: { evidences: true } } } },
        documents: { include: { chunks: { include: { embeddings: true } } } },
      },
    });
    ok("TradeCase tree has product", !!tree?.product && tree.product.name === "Phase7Product");
    ok("TradeCase tree has 1 document", tree?.documents.length === 1);
    ok("Document tree has 1 chunk", tree?.documents[0]?.chunks.length === 1);
    ok("Chunk tree has 1 embedding", tree?.documents[0]?.chunks[0]?.embeddings.length === 1);
    ok("Requirement tree has 1 evaluation", tree?.requirements[0]?.evaluation != null);
    ok("Evaluation tree has 1 evidence", tree?.requirements[0]?.evaluation?.evidences.length === 1);

    // Save IDs for the cascade test (step 9)
    phase7CaseId = tradeCase.id;
    phase7DocId = doc.id;
    phase7ChunkId = chunk.id;
    phase7EvalId = evalRow.id;
    phase7FixtureUserId = fixUser.id;
  }

  // ─── 7. Unique constraints ────────────────────────────────────────────────
  console.log("\n▶ 7. Unique constraints");
  {
    const dupEmail = `phase7-dup-${Date.now()}@example.com`;
    const u = await prisma.user.create({ data: { email: dupEmail, name: "Phase 7 Dup" } });
    let threw = false;
    try {
      await prisma.user.create({ data: { email: dupEmail, name: "Phase 7 Dup 2" } });
    } catch { threw = true; }
    ok("Duplicate User.email -> throws", threw === true);
    await prisma.user.delete({ where: { id: u.id } });

    // Second Product on the same TradeCase must throw
    const tradeCaseId = phase7CaseId as string;
    let threw2 = false;
    try {
      await prisma.product.create({ data: { name: "Phase7 Second Product", tradeCaseId } });
    } catch { threw2 = true; }
    ok("Second Product on same TradeCase -> throws", threw2 === true);
  }

  // ─── 8. Foreign-key integrity ─────────────────────────────────────────────
  console.log("\n▶ 8. Foreign-key integrity");
  {
    let threw = false;
    try {
      await prisma.document.create({
        data: {
          name: "phase7-orphan.txt",
          tradeCaseId: "00000000-0000-0000-0000-000000000000",
          status: "Missing",
        },
      });
    } catch { threw = true; }
    ok("Document with non-existent tradeCaseId -> throws", threw === true);
  }

  // ─── 9. Delete cascade ───────────────────────────────────────────────────
  console.log("\n▶ 9. Delete cascade (TradeCase -> Document -> Chunk -> Embedding)");
  {
    const tradeCaseId = phase7CaseId as string;
    const docId = phase7DocId as string;
    const chunkId = phase7ChunkId as string;
    const evalId = phase7EvalId as string;

    await prisma.tradeCase.delete({ where: { id: tradeCaseId } });

    const docGone = await prisma.document.findUnique({ where: { id: docId } });
    const chunkGone = await prisma.documentChunk.findUnique({ where: { id: chunkId } });
    const evalGone = await prisma.requirementEvaluation.findUnique({ where: { id: evalId } });
    ok("Document is cascade-deleted with TradeCase", docGone === null);
    ok("DocumentChunk is cascade-deleted with TradeCase", chunkGone === null);
    ok("RequirementEvaluation is cascade-deleted with TradeCase", evalGone === null);

    const fixtureUserId = phase7FixtureUserId as string;
    await prisma.user.delete({ where: { id: fixtureUserId } });
  }

  // ─── 10. Cross-user isolation ─────────────────────────────────────────────
  console.log("\n▶ 10. Cross-user isolation (DB level)");
  {
    const userAEmail = `phase7-isoA-${Date.now()}@example.com`;
    const userBEmail = `phase7-isoB-${Date.now()}@example.com`;
    const userA = await prisma.user.create({ data: { email: userAEmail, name: "Phase7 A" } });
    const userB = await prisma.user.create({ data: { email: userBEmail, name: "Phase7 B" } });
    const caseA = await prisma.tradeCase.create({
      data: { userId: userA.id, origin: "A-from", destination: "A-to" },
    });
    const caseB = await prisma.tradeCase.create({
      data: { userId: userB.id, origin: "B-from", destination: "B-to" },
    });

    // A should not see B's case
    const leak = await prisma.tradeCase.findFirst({ where: { id: caseB.id, userId: userA.id } });
    ok("A's findFirst for B's case id returns null", leak === null);

    // A's getTradeCases should not include B's case
    const aCases = await prisma.tradeCase.findMany({ where: { userId: userA.id } });
    ok("A's findMany({userId:A}) excludes B's case", aCases.every((c) => c.id !== caseB.id));

    // Cleanup (TradeCase is RESTRICTed on User, so delete cases first)
    await prisma.tradeCase.delete({ where: { id: caseA.id } });
    await prisma.tradeCase.delete({ where: { id: caseB.id } });
    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  }

  // ─── 11. Invalid UUID handling ────────────────────────────────────────────
  console.log("\n▶ 11. Invalid UUID handling");
  {
    const r = await prisma.tradeCase.findFirst({ where: { id: "not-a-uuid" } });
    ok("findFirst with non-UUID id returns null (no crash)", r === null);
  }

  // ─── 12. Transaction rollback ─────────────────────────────────────────────
  console.log("\n▶ 12. Transaction rollback (Phase 6 helper)");
  {
    const tag = `phase7-rollback-${Date.now()}`;
    let threw = false;
    try {
      await withTransaction(async (tx) => {
        await tx.session.create({
          data: {
            sessionToken: `${tag}-a`,
            userId: "00000000-0000-0000-0000-000000000000",
            expires: new Date(Date.now() + 60_000),
          },
        });
        throw new Error("phase7 intentional rollback");
      });
    } catch { threw = true; }
    ok("Transaction throws on inner error", threw === true);
    const survivors = await prisma.session.count({ where: { sessionToken: { startsWith: tag } } });
    ok("No partial rows survive rollback", survivors === 0, `count=${survivors}`);
  }

  // ─── 13. Index presence ───────────────────────────────────────────────────
  console.log("\n▶ 13. Index presence (the 5 Phase 7 indexes)");
  {
    const expected = [
      { table: "TradeCase", idx: "TradeCase_userId_idx" },
      { table: "Document", idx: "Document_tradeCaseId_idx" },
      { table: "Requirement", idx: "Requirement_tradeCaseId_idx" },
      { table: "RequirementEvaluation", idx: "RequirementEvaluation_tradeCaseId_idx" },
      { table: "EvaluationEvidence", idx: "EvaluationEvidence_evaluationId_idx" },
    ];
    for (const { table, idx } of expected) {
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_list("${table}")`);
      const names = rows.map((r) => r.name);
      ok(`${table} has ${idx}`, names.includes(idx), `indexes=${names.join(",")}`);
    }
  }

  // ─── 14. Indexed query plan ───────────────────────────────────────────────
  console.log("\n▶ 14. Indexed query plan");
  {
    const plan = await prisma.$queryRawUnsafe<{ detail: string }[]>(
      `EXPLAIN QUERY PLAN SELECT * FROM "TradeCase" WHERE userId = ?`,
      "00000000-0000-0000-0000-000000000000"
    );
    const planText = plan.map((r) => r.detail).join(" | ");
    info(`Plan: ${planText}`);
    ok("TradeCase.userId lookup uses index", /TradeCase_userId_idx|USING INDEX/i.test(planText), planText);

    const plan2 = await prisma.$queryRawUnsafe<{ detail: string }[]>(
      `EXPLAIN QUERY PLAN SELECT * FROM "Document" WHERE "tradeCaseId" = ?`,
      "00000000-0000-0000-0000-000000000000"
    );
    const plan2Text = plan2.map((r) => r.detail).join(" | ");
    info(`Plan: ${plan2Text}`);
    ok("Document.tradeCaseId lookup uses index", /Document_tradeCaseId_idx|USING INDEX/i.test(plan2Text), plan2Text);
  }

  // ─── 15. Phase 3 regression ───────────────────────────────────────────────
  console.log("\n▶ 15. Phase 3 regression");
  {
    const r = spawnSync("node", [tsxCli, "scripts/verify-phase3.ts"], { encoding: "utf-8", stdio: "pipe" });
    const stdout = (r.stdout || "") + (r.stderr || "");
    const passed = (stdout.match(/✅/g) || []).length;
    const failed = (stdout.match(/❌/g) || []).length;
    ok("verify-phase3.ts exits 0", r.status === 0, `exit=${r.status} passed=${passed} failed=${failed}`);
    if (r.status !== 0) console.log(stdout.split("\n").slice(-30).join("\n"));
  }

  // ─── 16. Phase 4 regression ───────────────────────────────────────────────
  console.log("\n▶ 16. Phase 4 regression");
  {
    const r = spawnSync("node", ["scripts/verify-phase4.mjs", cookiesFile], { encoding: "utf-8", stdio: "pipe" });
    const stdout = r.stdout || "";
    const passed = (stdout.match(/\[PASS\]/g) || []).length;
    const failed = (stdout.match(/\[FAIL\]/g) || []).length;
    ok("verify-phase4.mjs exits 0", r.status === 0, `exit=${r.status} pass=${passed} fail=${failed}`);
    if (r.status !== 0) console.log(stdout.split("\n").slice(-25).join("\n"));
  }

  // ─── 17. Phase 6 regression ───────────────────────────────────────────────
  console.log("\n▶ 17. Phase 6 regression");
  {
    const r = spawnSync("node", [tsxCli, "scripts/verify-phase6.mjs", cookiesFile], { encoding: "utf-8", stdio: "pipe" });
    const stdout = r.stdout || "";
    const passed = (stdout.match(/\[PASS\]/g) || []).length;
    const failed = (stdout.match(/\[FAIL\]/g) || []).length;
    ok("verify-phase6.mjs exits 0", r.status === 0, `exit=${r.status} pass=${passed} fail=${failed}`);
    if (r.status !== 0) console.log(stdout.split("\n").slice(-25).join("\n"));
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log(`Phase 7 verification: ${pass} pass, ${fail} fail, ${skipped.length} skipped`);
  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log("========================================\n");
  // Phase 18: clean up the FTS5 row created above so we don't leak
  // drift. The DocumentChunk row is deleted by the cascade in the
  // background (no `TradeCase` in this section) — we only need to
  // remove the FTS row to keep drift at 0.
  try {
    await ftsDeleteMany([phase7ChunkId]);
  } catch {
    /* best-effort */
  }
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Phase 7 verification crashed:", e);
  await prisma.$disconnect();
  process.exit(2);
});
