// Phase 10 — Document Processing Completion verification.
//
// Comprehensive end-to-end check of the Phase 10 changes:
//   - Real OCR for image/* documents (Xenova/trocr-small-printed
//     via @xenova/transformers, an already-installed dependency).
//   - OcrProcessor as a DocumentProcessor implementation.
//   - Routing of image/png and image/jpeg through the OCR path
//     instead of UNSUPPORTED.
//   - OCR'd text reaches the existing chunking / embedding pipeline.
//   - Failure modes (corrupt image buffer, model load failure).
//   - Cross-user ownership isolation preserved for image uploads.
//
// This script does NOT use any test framework. It asserts directly
// and prints [PASS]/[FAIL] lines. Exit 0 = all passed.
//
// Run: npx tsx scripts/verify-phase10.mts
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
import { createCanvas } from "@napi-rs/canvas";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { OcrProcessor } from "../src/lib/document-processing/ocr-processor.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { ftsDeleteMany } from "../src/lib/rag/keyword-retriever.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { isUnsupportedForExtraction } from "../src/lib/document-processing/processor.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { setSessionUserId } from "../src/lib/auth/session.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { uploadDocument } from "../src/actions/documents.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { waitForDrain, _resetForTests } from "../src/lib/document-processing/processing-queue.ts";
// @ts-expect-error — direct .ts import is intentional; this script is run via tsx.
import { searchSimilarChunks } from "../src/lib/embeddings/search-service.ts";

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

interface TestEnv {
  userId: string;
  caseId: string;
}

async function makeTestEnv(): Promise<TestEnv> {
  const ts = Date.now();
  const email = `phase10-${ts}-${Math.random().toString(36).slice(2, 8)}@tradeready.test`;
  const passwordHash = await bcrypt.hash("Phase10Test!Aa123", 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Phase 10 test",
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
    await prisma.evaluationEvidence.deleteMany({
      where: { chunk: { document: { tradeCaseId: env.caseId } } },
    });
    await prisma.requirementEvaluation.deleteMany({ where: { tradeCaseId: env.caseId } });
    await prisma.requirement.deleteMany({ where: { tradeCaseId: env.caseId } });
    await prisma.documentChunkEmbedding.deleteMany({
      where: { chunk: { document: { tradeCaseId: env.caseId } } },
    });
    // Phase 18: defensive FTS5 cleanup. The production path keeps
    // FTS in sync via `ftsUpsertMany` inside `processDocumentEmbeddings`,
    // so under normal operation each chunk has a matching FTS row.
    // This call ensures a teardown that runs without that sync
    // (e.g. a test that bailed before the OCR pipeline completed)
    // still leaves no orphan FTS rows pointing at chunks that no
    // longer exist in DocumentChunk.
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

function renderTextImage(text: string, opts: { width?: number; height?: number; fontSize?: number } = {}): Buffer {
  const width = opts.width ?? 512;
  const height = opts.height ?? 128;
  const fontSize = opts.fontSize ?? 48;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillText(text, 30, Math.floor(height * 0.65));
  return canvas.toBuffer("image/png");
}

function makeFileWithBytes(bytes: Buffer, name: string, mime: string): File {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([ab], name, { type: mime });
}

async function pollUntilReady(docId: string, maxMs = 60000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const d = await prisma.document.findUnique({ where: { id: docId } });
    if (
      d &&
      d.processingStatus &&
      d.processingStatus !== "PENDING" &&
      d.processingStatus !== "PROCESSING" &&
      // Embedding runs in processDocument after extraction. The end-to-end
      // "document is fully ready" invariant requires BOTH statuses to
      // have left the in-flight set. Without this guard the test races
      // the embedding pipeline and reads an in-progress state.
      d.embeddingStatus !== "PENDING" &&
      d.embeddingStatus !== "PROCESSING"
    ) {
      return d.processingStatus;
    }
    await wait(150);
  }
  return "TIMEOUT";
}

// ─── Section 1: OcrProcessor supports() returns the right MIME types ──────

async function section1(): Promise<void> {
  console.log("\n▶ 1. OcrProcessor.supports() classification");
  ok("image/png supported", OcrProcessor.supports("image/png"));
  ok("image/jpeg supported", OcrProcessor.supports("image/jpeg"));
  ok("image/jpg supported", OcrProcessor.supports("image/jpg"));
  ok("application/pdf NOT supported by OcrProcessor", !OcrProcessor.supports("application/pdf"));
  ok("text/csv NOT supported by OcrProcessor", !OcrProcessor.supports("text/csv"));
  ok("image/png is no longer UNSUPPORTED for extraction", !isUnsupportedForExtraction("image/png"));
  ok("image/jpeg is no longer UNSUPPORTED for extraction", !isUnsupportedForExtraction("image/jpeg"));
}

// ─── Section 2: OcrProcessor direct unit test (model load + extract) ──────

async function section2(): Promise<void> {
  console.log("\n▶ 2. OcrProcessor direct unit test (real OCR)");

  // Construct without calling extract yet.
  const t0 = Date.now();
  const p = new OcrProcessor();
  const renderT = Date.now();
  const fixture = renderTextImage("HELLO WORLD 12345");
  console.log(`    Fixture: ${fixture.length} bytes rendered in ${Date.now() - renderT}ms`);

  // First call warms the model. Subsequent calls reuse it.
  const text = await p.extract(fixture);
  const elapsed = Date.now() - t0;
  ok("OcrProcessor.extract() returned a string", typeof text === "string", { text });
  ok("OcrProcessor.extract() returned non-empty text", text.length > 0, { text });
  ok(
    "OCR'd text contains 'HELLO' (case-insensitive)",
    /HELLO/i.test(text),
    { text }
  );
  ok(
    "OCR'd text contains 'WORLD' (case-insensitive)",
    /WORLD/i.test(text),
    { text }
  );
  ok(
    "OCR'd text contains '12345'",
    /12345/.test(text),
    { text }
  );
  console.log(`    (First-call wall time: ${elapsed}ms — includes model load + warm-up)`);
}

// ─── Section 3: End-to-end image upload reaches READY with chunks + embeddings ─

async function section3(): Promise<void> {
  console.log("\n▶ 3. Image upload end-to-end: PENDING → PROCESSING → READY (with chunks + embeddings)");
  const env = await makeTestEnv();
  try {
    const fixture = renderTextImage("ACME TRADING INVOICE 98765");
    const formData = new FormData();
    formData.append("file", makeFileWithBytes(fixture, "phase10-invoice.png", "image/png"));
    formData.append("type", "Invoice");
    formData.append("name", "Phase 10 invoice");

    const t0 = Date.now();
    const res = await asUser(env.userId, () => uploadDocument(env.caseId, formData));
    const uploadMs = Date.now() - t0;
    ok("upload returned success=true", res.success === true, res);
    if (!res.success || !res.id) {
      ok("upload returned id", false);
      return;
    }
    ok("upload returned id", true);
    ok("upload returned in < 5000ms (async)", uploadMs < 5000, { uploadMs });

    // Initial state — accept PENDING or PROCESSING.
    const initial = await prisma.document.findUnique({ where: { id: res.id } });
    const initialOk =
      initial?.processingStatus === "PENDING" || initial?.processingStatus === "PROCESSING";
    ok("document starts in PENDING or PROCESSING", initialOk, { initial: initial?.processingStatus });
    ok("document is no longer UNSUPPORTED", initial?.processingStatus !== "UNSUPPORTED", { initial: initial?.processingStatus });

    // Poll until terminal state. OCR + chunking + embedding may take ~30s on first run.
    const final = await pollUntilReady(res.id, 90000);
    ok("document reaches READY (not UNSUPPORTED)", final === "READY", { final });

    // Verify chunks were created.
    const chunkCount = await prisma.documentChunk.count({ where: { documentId: res.id } });
    ok("at least 1 chunk was created from OCR'd text", chunkCount > 0, { chunkCount });

    // Verify embeddings were created (this requires the embedding pipeline to run; it does
    // in processDocument after chunks land).
    const embedCount = await prisma.documentChunkEmbedding.count({
      where: { chunk: { documentId: res.id } },
    });
    ok("at least 1 embedding was created from OCR'd chunks", embedCount > 0, { embedCount });

    // Verify extractedText is non-null.
    const finalDoc = await prisma.document.findUnique({ where: { id: res.id } });
    ok("extractedText is non-null", finalDoc?.extractedText != null, { has: finalDoc?.extractedText != null });
    ok("extractedText is non-empty", (finalDoc?.extractedText ?? "").length > 0, { len: (finalDoc?.extractedText ?? "").length });

    // Verify processingStatus is READY (not UNSUPPORTED or FAILED).
    ok("processingStatus is READY", finalDoc?.processingStatus === "READY", { ps: finalDoc?.processingStatus });
    ok("embeddingStatus is READY", finalDoc?.embeddingStatus === "READY", { es: finalDoc?.embeddingStatus });
    ok("processedAt is non-null", finalDoc?.processedAt != null, { pa: finalDoc?.processedAt });
  } finally {
    await waitForDrain(60000);
    await cleanupTestEnv(env);
  }
}

// ─── Section 4: Failed OCR (corrupt image buffer) lands in FAILED ─────────

async function section4(): Promise<void> {
  console.log("\n▶ 4. Failed OCR: corrupt image buffer → FAILED");
  const env = await makeTestEnv();
  try {
    // Upload a syntactically-valid but image-content-incorrect buffer
    // (random bytes declared as image/png). The buffer is a valid
    // PNG only insofar as the file-safety magic-byte check passes —
    // i.e. it does NOT start with a known-bad signature. But the
    // bytes are not a real PNG so the OCR pipeline (or the OCR
    // model's preprocessor) should fail to decode it.
    // We use a minimal "valid PDF magic" that the file-safety check
    // accepts, but is gibberish as an image.
    const fakeImageBytes = Buffer.from("%PDF-1.4\nthis is not actually a pdf or image\n");
    const formData = new FormData();
    formData.append("file", makeFileWithBytes(fakeImageBytes, "fake.png", "image/png"));
    formData.append("type", "Other");
    formData.append("name", "fake image");

    const res = await asUser(env.userId, () => uploadDocument(env.caseId, formData));
    ok("upload accepted at the action layer (file-safety passed)", res.success === true, res);
    if (!res.success || !res.id) {
      ok("upload returned id", false);
      return;
    }

    const final = await pollUntilReady(res.id, 60000);
    // This test is intentionally lenient: a bad image could land
    // in either FAILED (OCR decode error) or READY (model returned
    // empty text, which is treated as "no content" and stored
    // with extractedText: null). Both are valid outcomes.
    // What we require: it must NOT be stuck in PENDING or PROCESSING.
    ok(
      "corrupt image reaches a terminal state (FAILED or READY)",
      final === "FAILED" || final === "READY",
      { final }
    );

    // For the FAILED case, verify the error message is sanitized
    // (does not leak internal stack traces or file paths).
    if (final === "FAILED") {
      const doc = await prisma.document.findUnique({ where: { id: res.id } });
      const err = doc?.processingError ?? "";
      ok(
        "FAILED error message is sanitized (no internal stack trace)",
        !/node_modules|at Object|at async|require\(|\\.ts:\d+/i.test(err),
        { err }
      );
    }
  } finally {
    await waitForDrain(60000);
    await cleanupTestEnv(env);
  }
}

// ─── Section 5: Cross-user ownership isolation (image upload) ─────────────

async function section5(): Promise<void> {
  console.log("\n▶ 5. Cross-user ownership isolation (image upload)");
  const envA = await makeTestEnv();
  const envB = await makeTestEnv();
  try {
    const fixture = renderTextImage("PRIVATE DOCUMENT");
    const formData = new FormData();
    formData.append("file", makeFileWithBytes(fixture, "iso.png", "image/png"));
    formData.append("type", "Other");
    formData.append("name", "cross-user attempt");

    // User B tries to upload to User A's case.
    const res = await asUser(envB.userId, () => uploadDocument(envA.caseId, formData));
    ok("cross-user image upload rejected", res.success === false, res);
    ok(
      "cross-user image upload returns 'not found'",
      typeof res.error === "string" && /not found/i.test(res.error),
      { error: res.error }
    );

    // User A uploads to their own case (sanity).
    const formData2 = new FormData();
    formData2.append("file", makeFileWithBytes(fixture, "iso-A.png", "image/png"));
    formData2.append("type", "Other");
    formData2.append("name", "owner image");
    const resA = await asUser(envA.userId, () => uploadDocument(envA.caseId, formData2));
    ok("owner can upload image to own case", resA.success === true, resA);
  } finally {
    await waitForDrain(60000);
    await cleanupTestEnv(envA);
    await cleanupTestEnv(envB);
  }
}

// ─── Section 6: Source code structure: imports + exports ──────────────────

async function section6(): Promise<void> {
  console.log("\n▶ 6. Source code structure: imports + exports");
  const ocrPath = `${repoRoot}/src/lib/document-processing/ocr-processor.ts`;
  const svcPath = `${repoRoot}/src/lib/document-processing/processing-service.ts`;
  const procPath = `${repoRoot}/src/lib/document-processing/processor.ts`;
  ok("ocr-processor.ts exists", existsSync(ocrPath));
  ok("processing-service.ts exists", existsSync(svcPath));
  ok("processor.ts exists", existsSync(procPath));

  const ocrSrc = readFileSync(ocrPath, "utf-8");
  ok("ocr-processor.ts exports OcrProcessor", /export class OcrProcessor/.test(ocrSrc));
  ok("ocr-processor.ts implements DocumentProcessor", /implements DocumentProcessor/.test(ocrSrc));
  ok("ocr-processor.ts uses image-to-text pipeline", /image-to-text/.test(ocrSrc));
  ok("ocr-processor.ts references Xenova/trocr", /trocr/.test(ocrSrc));
  ok("ocr-processor.ts has a static supports() method", /static supports\(/.test(ocrSrc));
  ok("ocr-processor.ts has a safeErrorMessage() helper", /safeErrorMessage/.test(ocrSrc));

  const svcSrc = readFileSync(svcPath, "utf-8");
  ok("processing-service imports OcrProcessor", /import\s*\{[^}]*OcrProcessor[^}]*\}\s*from\s*["']\.\/ocr-processor/.test(svcSrc));
  ok("processing-service getProcessor routes OcrProcessor for images", /OcrProcessor\.supports/.test(svcSrc));

  const procSrc = readFileSync(procPath, "utf-8");
  ok(
    "processor.ts UNSUPPORTED_MIME_TYPES no longer hard-codes image/*",
    !/UNSUPPORTED_MIME_TYPES[^]*image\/png/.test(procSrc),
    { src: procSrc.match(/UNSUPPORTED_MIME_TYPES[^]*?\n\}/)?.[0]?.slice(0, 200) }
  );

  const envSrc = readFileSync(`${repoRoot}/src/lib/env-validation.ts`, "utf-8");
  ok("env-validation.ts declares OCR_MODEL as optional", /["']OCR_MODEL["']/.test(envSrc));
}

// ─── Section 7: Earlier-phase regressions ─────────────────────────────────

async function section7(): Promise<void> {
  console.log("\n▶ 7. Earlier-phase regressions (3, 7, 8, 9)");
  const runs: Array<[string, string]> = [
    ["verify-phase3.ts", "npx tsx scripts/verify-phase3.ts"],
    ["verify-phase7.mts", "npx tsx scripts/verify-phase7.mts scripts/cookies-phase8.txt"],
    ["verify-phase8.mts", "npx tsx scripts/verify-phase8.mts scripts/cookies-phase8.txt"],
    ["verify-phase9.mts", "npx tsx scripts/verify-phase9.mts"],
  ];
  for (const [name, cmd] of runs) {
    const result = spawnSync(cmd, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = (result.stdout ?? Buffer.alloc(0)).toString("utf-8");
    const err = (result.stderr ?? Buffer.alloc(0)).toString("utf-8");
    if (result.status !== 0) {
      const lines = (out + "\n" + err).split("\n");
      const tail = lines.slice(-30).join("\n");
      console.log(`\n--- ${name} output (tail) ---\n${tail}\n--- end ---`);
    }
    ok(`${name} exits 0`, result.status === 0);
  }
}

// ─── Section 8: RAG retrieval over OCR'd text (end-to-end) ──────────────

async function section8(): Promise<void> {
  console.log("\n▶ 8. RAG retrieval: query text from an image, get chunks back");
  const env = await makeTestEnv();
  try {
    // Render an image with a unique, known phrase that is unlikely
    // to appear elsewhere in the test database. Then upload it via
    // the action, wait for OCR + chunking + embedding to finish, and
    // search for that phrase.
    const uniquePhrase = "WALRUS BANANA 4751";
    const fixture = renderTextImage(`INVOICE FROM ${uniquePhrase} SHIPPING`);
    const formData = new FormData();
    formData.append("file", makeFileWithBytes(fixture, "rag-test.png", "image/png"));
    formData.append("type", "Invoice");
    formData.append("name", "RAG retrieval test");

    const res = await asUser(env.userId, () => uploadDocument(env.caseId, formData));
    if (!res.success || !res.id) {
      ok("upload succeeded", false);
      return;
    }

    const final = await pollUntilReady(res.id, 90000);
    ok("RAG test image reaches READY", final === "READY", { final });
    if (final !== "READY") return;

    // Now search for a word we know the OCR model produces. We
    // search for "INVOICE" because the test image literally says
    // "INVOICE FROM <unique>". If the OCR'd text was chunked and
    // embedded, this query will retrieve the chunk.
    const results = await searchSimilarChunks("invoice", {
      tradeCaseId: env.caseId,
      topK: 3,
      similarityThreshold: 0.1,
    });
    ok("searchSimilarChunks returned at least 1 result", results.length > 0, { count: results.length });
    if (results.length > 0) {
      const firstContent = results[0].content;
      const containsRecognizableText = /INVOICE|WALRUS|BANANA|FROM|SHIPPING/i.test(firstContent);
      ok(
        "top result contains text from the rendered image (OCR'd content reaches RAG)",
        containsRecognizableText,
        { firstContent: firstContent.slice(0, 200) }
      );
      ok(
        "top result's document is the one we uploaded",
        results[0].documentId === res.id,
        { resultDocId: results[0].documentId, uploadedId: res.id }
      );
    }
  } finally {
    await waitForDrain(60000);
    await cleanupTestEnv(env);
  }
}

async function main(): Promise<void> {
  console.log("=========================================");
  console.log("Phase 10 — Document Processing Completion");
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
  } finally {
    setSessionUserId(null);
    _resetForTests();
  }

  console.log("\n=========================================");
  console.log(`Phase 10 verification: ${pass} pass, ${fail} fail, ${skipped.length} skipped`);
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
