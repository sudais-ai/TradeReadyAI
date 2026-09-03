// Phase 9 — Document Processing Hardening verification.
//
// Comprehensive end-to-end check of the Phase 9 changes:
//   - Async processing queue (bounded concurrency, error isolation,
//     drain behavior, deleted-document handling).
//   - File-safety check (magic-byte rejection of PE/ELF/Mach-O/Java
//     class/shell shebang/PDF-JS/Office macros/OLE-mismatch).
//   - Upload action wires safety + queue correctly.
//
// This script does NOT use any test framework. It asserts directly
// and prints [PASS]/[FAIL] lines. Exit 0 = all passed.
//
// Run: npx tsx scripts/verify-phase9.mts
// The dev server is not required to be running (this script uses
// direct server-action calls via the session stub).
//
// The script seeds its own test users + trade cases via Prisma, so
// the existing demo user / cookies file are not modified.

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { setTimeout as wait } from "timers/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { scanBuffer } from "../src/lib/document-processing/file-safety.ts";
import {
  enqueueDocumentProcessing,
  getQueueStats,
  getJob,
  waitForJob,
  waitForDrain,
  setConcurrency,
  _resetForTests,
  // @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
} from "../src/lib/document-processing/processing-queue.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { setSessionUserId } from "../src/lib/auth/session.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { uploadDocument } from "../src/actions/documents.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { ftsDeleteMany } from "../src/lib/rag/keyword-retriever.ts";

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

const repoRoot = process.cwd().replace(/\\/g, "/");

// ─── Helpers ────────────────────────────────────────────────────────────────

async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  setSessionUserId(userId);
  try {
    return await fn();
  } finally {
    setSessionUserId(null);
  }
}

function makeFileWithBytes(bytes: Buffer, name: string, mime: string): File {
  // Use a Blob with the underlying ArrayBuffer slice, then construct
  // the File from that. This sidesteps the Buffer/BlobPart type
  // mismatch under stricter lib.dom.d.ts versions.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([ab], name, { type: mime });
}

function makeValidCsv(name: string): File {
  const data = "apple,export,Peru,Japan\nbanana,export,Ecuador,USA\n";
  const ab = new TextEncoder().encode(data).buffer as ArrayBuffer;
  return new File([ab], name, { type: "text/csv" });
}

async function pollUntilReady(docId: string, maxMs = 30000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const d = await prisma.document.findUnique({ where: { id: docId } });
    if (d && d.processingStatus && d.processingStatus !== "PENDING" && d.processingStatus !== "PROCESSING") {
      return d.processingStatus;
    }
    await wait(100);
  }
  return "TIMEOUT";
}

interface TestEnv {
  userId: string;
  caseId: string;
}

async function makeTestEnv(): Promise<TestEnv> {
  const ts = Date.now();
  const email = `phase9-${ts}-${Math.random().toString(36).slice(2, 8)}@tradeready.test`;
  const passwordHash = await bcrypt.hash("Phase9Test!Aa123", 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Phase 9 test",
      passwordChangedAt: new Date(),
    },
  });
  const tradeCase = await prisma.tradeCase.create({
    data: {
      userId: user.id,
      origin: "Test Origin",
      destination: "Test Destination",
      direction: "Export",
    },
  });
  return { userId: user.id, caseId: tradeCase.id };
}

async function cleanupTestEnv(env: TestEnv): Promise<void> {
  try {
    // Delete in reverse-cascade order. DocumentChunk / embeddings
    // are tied to Document; Requirement* tied to TradeCase.
    await prisma.evaluationEvidence.deleteMany({
      where: { chunk: { document: { tradeCaseId: env.caseId } } },
    });
    await prisma.requirementEvaluation.deleteMany({ where: { tradeCaseId: env.caseId } });
    await prisma.requirement.deleteMany({ where: { tradeCaseId: env.caseId } });
    await prisma.documentChunkEmbedding.deleteMany({
      where: { chunk: { document: { tradeCaseId: env.caseId } } },
    });
    // Phase 18: remove FTS5 rows for this test env before deleting the
    // DocumentChunk rows. The production `processing-service.ts` keeps
    // FTS in sync via `ftsUpsertMany`, so the normal path is balanced.
    // This defensive call guards against the test path where a chunk
    // exists in DocumentChunk but never made it to FTS (e.g. a section
    // failure that left the chunk in the DB without an FTS row).
    {
      const chunkIds = await prisma.documentChunk.findMany({
        where: { document: { tradeCaseId: env.caseId } },
        select: { id: true },
      });
      if (chunkIds.length > 0) {
        await ftsDeleteMany(chunkIds.map((c) => c.id));
      }
    }
    await prisma.documentChunk.deleteMany({
      where: { document: { tradeCaseId: env.caseId } },
    });
    await prisma.document.deleteMany({ where: { tradeCaseId: env.caseId } });
    await prisma.tradeCase.delete({ where: { id: env.caseId } });
    await prisma.user.delete({ where: { id: env.userId } });
  } catch {
    /* best-effort */
  }
}

// ─── Section 1: file-safety direct unit checks ─────────────────────────────

async function section1(): Promise<void> {
  console.log("\n▶ 1. File-safety direct unit checks");
  // Empty buffer
  const r0 = scanBuffer(Buffer.alloc(0), "application/pdf");
  ok("empty buffer rejected", !r0.safe, r0);

  // Valid PDF magic + nothing else
  const validPdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100, 0x20)]);
  const r1 = scanBuffer(validPdf, "application/pdf");
  ok("plain PDF accepted", r1.safe, r1);

  // Valid CSV
  const csv = Buffer.from("a,b,c\n1,2,3\n");
  const r2 = scanBuffer(csv, "text/csv");
  ok("plain CSV accepted", r2.safe, r2);

  // Windows PE (MZ)
  const pe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100, 0)]);
  const r3 = scanBuffer(pe, "application/pdf");
  ok("PE (MZ) header rejected", !r3.safe, r3);

  // Linux ELF
  const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100, 0)]);
  const r4 = scanBuffer(elf, "application/pdf");
  ok("ELF header rejected", !r4.safe, r4);

  // Mach-O (FEEDFACE)
  const mac1 = Buffer.concat([Buffer.from([0xfe, 0xed, 0xfa, 0xce]), Buffer.alloc(100, 0)]);
  const r5 = scanBuffer(mac1, "application/pdf");
  ok("Mach-O (FEEDFACE) header rejected", !r5.safe, r5);

  // Mach-O (CEFAEDFE)
  const mac2 = Buffer.concat([Buffer.from([0xce, 0xfa, 0xed, 0xfe]), Buffer.alloc(100, 0)]);
  const r6 = scanBuffer(mac2, "application/pdf");
  ok("Mach-O (CEFAEDFE) header rejected", !r6.safe, r6);

  // Java class
  const jc = Buffer.concat([Buffer.from([0xca, 0xfe, 0xba, 0xbe]), Buffer.alloc(100, 0)]);
  const r7 = scanBuffer(jc, "application/pdf");
  ok("Java class file rejected", !r7.safe, r7);

  // Shell script
  const sh = Buffer.from("#!/bin/sh\necho hi\n");
  const r8 = scanBuffer(sh, "text/csv");
  ok("shell shebang rejected", !r8.safe, r8);

  // PDF with /JavaScript
  const pdfJs = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /JavaScript 1 >> endobj\n");
  const r9 = scanBuffer(pdfJs, "application/pdf");
  ok("PDF with /JavaScript action rejected", !r9.safe, r9);

  // OLE compound file under unexpected MIME
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
  const r10 = scanBuffer(ole, "text/csv");
  ok("OLE compound file under wrong MIME rejected", !r10.safe, r10);

  // OLE compound file under expected MIME
  const r11 = scanBuffer(ole, "application/msword");
  ok("OLE compound file under msword MIME accepted", r11.safe, r11);
}

// ─── Section 2: queue direct unit checks ──────────────────────────────────

async function section2(): Promise<void> {
  console.log("\n▶ 2. Processing queue direct unit checks");
  _resetForTests();
  ok("initial queue is empty", getQueueStats().totalTracked === 0, getQueueStats());

  setConcurrency(2);
  ok("concurrency set to 2", getQueueStats().concurrency === 2);

  // Setting concurrency below 1 should throw.
  let threw = false;
  try {
    setConcurrency(0);
  } catch {
    threw = true;
  }
  ok("concurrency = 0 throws", threw);

  setConcurrency(1);
  ok("concurrency = 1 accepted", getQueueStats().concurrency === 1);
}

// ─── Section 3: upload happy path (async processing) ─────────────────────

async function section3(): Promise<void> {
  console.log("\n▶ 3. Upload action: happy path (async processing)");
  const env = await makeTestEnv();
  try {
    const formData = new FormData();
    formData.append("file", makeValidCsv("p9-3.csv"));
    formData.append("type", "Other");
    formData.append("name", "Phase 9 happy path");

    const t0 = Date.now();
    const res = await asUser(env.userId, () => uploadDocument(env.caseId, formData));
    const elapsed = Date.now() - t0;

    // Async: upload should return quickly (well under 5 seconds for a
    // tiny CSV). 5 seconds is generous; production would be sub-second.
    ok("upload returned in < 5000ms (async)", elapsed < 5000, { elapsedMs: elapsed });
    ok("upload returned success=true", res.success === true, res);
    if (!res.success || !res.id) {
      ok("upload returned id", false);
      return;
    }
    ok("upload returned id", true);

    // Initial state should be PENDING (worker may have already
    // started — we accept both PENDING and PROCESSING).
    const initial = await prisma.document.findUnique({ where: { id: res.id } });
    const initialOk =
      initial?.processingStatus === "PENDING" || initial?.processingStatus === "PROCESSING";
    ok("document starts in PENDING or PROCESSING", initialOk, { initial: initial?.processingStatus });

    // Poll until terminal state.
    const final = await pollUntilReady(res.id, 30000);
    ok("document reaches READY", final === "READY", { final });

    // Sanity: chunk was created.
    const chunkCount = await prisma.documentChunk.count({ where: { documentId: res.id } });
    ok("at least 1 chunk created", chunkCount > 0, { chunkCount });
  } finally {
    await cleanupTestEnv(env);
  }
}

// ─── Section 4: file-safety wired into upload action ──────────────────────

async function section4(): Promise<void> {
  console.log("\n▶ 4. Upload action: rejects PE/ELF/script via file-safety");
  const env = await makeTestEnv();
  try {
    // Try to upload a Windows PE under an allowed PDF MIME.
    const peBytes = Buffer.concat([Buffer.from("MZ\x90\x00"), Buffer.alloc(100, 0)]);
    const f1 = new FormData();
    f1.append("file", makeFileWithBytes(peBytes, "fake.pdf", "application/pdf"));
    f1.append("type", "Other");
    f1.append("name", "PE disguised as PDF");
    const r1 = await asUser(env.userId, () => uploadDocument(env.caseId, f1));
    ok("PE upload rejected (success=false)", r1.success === false, r1);
    ok(
      "PE upload error mentions rejection",
      typeof r1.error === "string" && r1.error.toLowerCase().includes("rejected"),
      { error: r1.error }
    );

    // ELF under allowed MIME.
    const elfBytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100, 0)]);
    const f2 = new FormData();
    f2.append("file", makeFileWithBytes(elfBytes, "fake.pdf", "application/pdf"));
    f2.append("type", "Other");
    f2.append("name", "ELF disguised as PDF");
    const r2 = await asUser(env.userId, () => uploadDocument(env.caseId, f2));
    ok("ELF upload rejected", r2.success === false, r2);

    // Shell script under CSV MIME.
    const sh = Buffer.from("#!/bin/sh\nrm -rf /\n");
    const f3 = new FormData();
    f3.append("file", makeFileWithBytes(sh, "fake.csv", "text/csv"));
    f3.append("type", "Other");
    f3.append("name", "shell disguised as CSV");
    const r3 = await asUser(env.userId, () => uploadDocument(env.caseId, f3));
    ok("shell upload rejected", r3.success === false, r3);

    // Confirm no documents persisted in the DB.
    const docCount = await prisma.document.count({ where: { tradeCaseId: env.caseId } });
    ok("no documents persisted after rejected uploads", docCount === 0, { docCount });
  } finally {
    await cleanupTestEnv(env);
  }
}

// ─── Section 5: queue bounded concurrency + drain ─────────────────────────

async function section5(): Promise<void> {
  console.log("\n▶ 5. Queue: bounded concurrency + drain");
  const env = await makeTestEnv();
  try {
    setConcurrency(2);
    // Create 6 documents directly via Prisma (no fileRef so the
    // worker will set FAILED — we are testing queue mechanics, not
    // processing success).
    const docs: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = await prisma.document.create({
        data: {
          tradeCaseId: env.caseId,
          name: `p9-5-${i}.csv`,
          type: "Other",
          status: "Added",
          mimeType: "text/csv",
        },
      });
      docs.push(d.id);
    }

    const jobIds: string[] = [];
    for (const id of docs) {
      const { jobId } = enqueueDocumentProcessing(id);
      jobIds.push(jobId);
    }
    ok("6 jobs enqueued", jobIds.length === 6);

    // The queue should have running <= 2 immediately after enqueue.
    const stats = getQueueStats();
    ok("running <= concurrency (2)", stats.running <= 2, stats);
    const inFlight = stats.pending + stats.running;
    ok("pending + running = 6", inFlight === 6, { inFlight });

    // Wait for drain.
    const drained = await waitForDrain(30000);
    ok("queue drained within 30s", drained, { stats: getQueueStats() });

    // All 6 jobs should be in a terminal state. The CSV-without-file
    // path is a clean FAILED (processDocument handles missing fileRef
    // by writing FAILED; it does not throw).
    let completedCount = 0;
    let failedCount = 0;
    for (const id of jobIds) {
      const j = getJob(id);
      if (j?.status === "completed") completedCount++;
      else if (j?.status === "failed") failedCount++;
    }
    ok(
      "all 6 jobs in terminal state (completed or failed)",
      completedCount + failedCount === 6,
      { completed: completedCount, failed: failedCount }
    );
  } finally {
    setConcurrency(2); // restore default
    await cleanupTestEnv(env);
  }
}

// ─── Section 6: queue handles deleted document gracefully ─────────────────

async function section6(): Promise<void> {
  console.log("\n▶ 6. Queue: handles a deleted document gracefully");
  _resetForTests();
  // "Document not found" inside processDocument throws. The worker
  // catches that and treats the job as completed (deleting a document
  // is a legitimate operation; not a processing failure).
  const { jobId } = enqueueDocumentProcessing("non-existent-id-12345");
  const result = await waitForJob(jobId, 10000);
  ok("deleted-document job is treated as completed", result === "completed", { result });
}

// ─── Section 7: source-code structure checks ───────────────────────────────

async function section7(): Promise<void> {
  console.log("\n▶ 7. Source code structure: imports + exports");
  const queuePath = `${repoRoot}/src/lib/document-processing/processing-queue.ts`;
  const safetyPath = `${repoRoot}/src/lib/document-processing/file-safety.ts`;
  ok("processing-queue.ts exists", existsSync(queuePath));
  ok("file-safety.ts exists", existsSync(safetyPath));

  const queueSrc = readFileSync(queuePath, "utf-8");
  ok("queue exports enqueueDocumentProcessing", /export function enqueueDocumentProcessing/.test(queueSrc));
  ok("queue exports getQueueStats", /export function getQueueStats/.test(queueSrc));
  ok("queue exports waitForJob", /export function waitForJob/.test(queueSrc));
  ok("queue imports processDocument", /import.*processDocument.*from.*processing-service/.test(queueSrc));

  const safetySrc = readFileSync(safetyPath, "utf-8");
  ok("safety exports scanBuffer", /export function scanBuffer/.test(safetySrc));
  ok("safety rejects MZ", /0x4d.*0x5a|MZ/.test(safetySrc));
  ok("safety rejects ELF", /0x7f.*0x45.*0x4c.*0x4f|ELF/.test(safetySrc));

  const docsSrc = readFileSync(`${repoRoot}/src/actions/documents.ts`, "utf-8");
  ok(
    "uploadDocument calls enqueueDocumentProcessing",
    /enqueueDocumentProcessing\(doc\.id\)/.test(docsSrc)
  );
  ok(
    "uploadDocument calls scanBuffer",
    /scanBuffer\(buffer, file\.type\)/.test(docsSrc)
  );
  ok(
    "uploadDocument no longer awaits processDocument inline",
    !/await processDocument\(doc\.id\)/.test(docsSrc)
  );
}

// ─── Section 8: cross-user ownership isolation (re-confirm) ────────────────

async function section8(): Promise<void> {
  console.log("\n▶ 8. Cross-user ownership isolation (Phase 2 Part 15-style)");
  // User A creates a case and uploads a doc. User B (signed in) must
  // not be able to upload to User A's case.
  const envA = await makeTestEnv();
  const envB = await makeTestEnv();
  try {
    const f = new FormData();
    f.append("file", makeValidCsv("isolation.csv"));
    f.append("type", "Other");
    f.append("name", "isolation check");

    // User B tries to upload to User A's case.
    const res = await asUser(envB.userId, () => uploadDocument(envA.caseId, f));
    ok("cross-user upload rejected", res.success === false, res);
    ok(
      "cross-user upload returns 'Trade case not found.'",
      typeof res.error === "string" && /not found/i.test(res.error),
      { error: res.error }
    );

    // User A uploads to User A's own case (sanity).
    const f2 = new FormData();
    f2.append("file", makeValidCsv("isolation-A.csv"));
    f2.append("type", "Other");
    f2.append("name", "isolation check A");
    const resA = await asUser(envA.userId, () => uploadDocument(envA.caseId, f2));
    ok("owner can upload to own case", resA.success === true, resA);

    // Wait for the queue to drain before cleanup, so the worker does
    // not race with the document delete.
    await waitForDrain(30000);
  } finally {
    await cleanupTestEnv(envA);
    await cleanupTestEnv(envB);
  }
}

// ─── Section 9: Phase 3, 8 regressions ────────────────────────────────────

async function section9(): Promise<void> {
  console.log("\n▶ 9. Earlier-phase regressions");
  // Use shell:true so that `npx` (which is `npx.cmd` on Windows)
  // is resolved through the user's PATH the way the shell does it.
  const result = spawnSync("npx tsx scripts/verify-phase3.ts", {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = (result.stdout ?? Buffer.alloc(0)).toString("utf-8");
  const err = (result.stderr ?? Buffer.alloc(0)).toString("utf-8");
  if (result.status !== 0) {
    const lines = (out + "\n" + err).split("\n");
    const tail = lines.slice(-40).join("\n");
    console.log("\n--- Phase 3 regression output (tail) ---\n" + tail + "\n--- end ---\n");
  } else {
    const lines = out.split("\n");
    const tail = lines.slice(-6).join("\n");
    console.log(tail);
  }
  ok("verify-phase3.ts exits 0", result.status === 0);
}

async function main(): Promise<void> {
  console.log("=========================================");
  console.log("Phase 9 — Document Processing Hardening");
  console.log("=========================================");

  setSessionUserId(null);
  _resetForTests();

  try {
    await section1();
    await section2();
    await section3();
    await section4();
    await section5();
    await section6();
    await section7();
    await section8();
    await section9();
  } finally {
    setSessionUserId(null);
    _resetForTests();
  }

  console.log("\n=========================================");
  console.log(`Phase 9 verification: ${pass} pass, ${fail} fail, ${skipped.length} skipped`);
  console.log("=========================================");
  if (skipped.length > 0) {
    console.log("Skipped: " + skipped.join(", "));
  }
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("TOP-LEVEL ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
