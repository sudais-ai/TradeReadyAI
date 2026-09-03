# Phase 10 Audit Finding — Repository & Roadmap Reconciliation

**Date:** 2026-08-29
**Author:** Repository audit (read-only).
**Status:** ✅ Audit complete. Phase 10 scope established from evidence.

---

## 1. Roadmap reconciliation

The only authoritative enumeration of future phases is `PHASE6-FINAL-REPORT.md` §20 "Out of Scope (intentionally deferred)". That list names:

> **Phase 10 (Document Processing)** — real OCR, virus scan, async pipeline, queue.

Phase 9 (which is an invented phase in the project plan — see `PHASE9-AUDIT-FINDING.md`) implemented the latter two of those four items:

- **Async pipeline, queue** → DONE in Phase 9 (`src/lib/document-processing/processing-queue.ts`).
- **Virus scan** → PARTIALLY DONE in Phase 9 (`src/lib/document-processing/file-safety.ts` is a magic-byte / structural check, **not** a real AV scanner; the source comment is explicit about this).

What remains for Phase 10:

- **Real OCR** for image documents.
- **Real virus scan** to the extent that it can be implemented without violating the architecture rules.

## 2. Repository inspection

Performed before any code change:

- `package.json` — `dependencies` confirmed.
- `prisma/schema.prisma` — model confirmed unchanged from Phase 8.
- `src/lib/document-processing/*` — confirmed Phase 9 baseline.
- `src/lib/embeddings/providers/local-provider.ts` — uses `@xenova/transformers` already.
- `src/lib/embeddings/config.ts` — `EMBEDDING_PROVIDER` defaults to `local`.
- `src/lib/env-validation.ts` — no new required env vars.
- `scripts/verify-phase9.mts` — confirmed passing (49/49).
- `src/actions/documents.ts`, `src/actions/processing.ts` — confirmed unchanged from Phase 9.
- `src/components/documents/ProcessingStatusIndicator.tsx` — confirmed (out of scope for Phase 10).
- `node_modules/@xenova/transformers/src/pipelines.js` — confirmed `image-to-text` task + `Xenova/trocr-small-printed` model available.
- `node_modules/@napi-rs/canvas` — confirmed present, can render test fixtures.

## 3. OCR feasibility — empirically verified

A proof-of-concept script (`scripts/_test_xenova_ocr.mts`, run during the audit) confirmed:

1. The `@xenova/transformers` library loads in ~340ms (cached).
2. The `Xenova/trocr-small-printed` model downloads + warms in ~58s on first call, ~1.3s when cached.
3. OCR on a rendered `HELLO WORLD 12345` image returns the correct text in ~510ms.
4. The library is **already in `dependencies`** (added in an earlier phase for the local embedding provider).
5. The `@napi-rs/canvas` library is **already in `dependencies`** and can render test fixtures without external binaries.

**No new dependencies are required to ship real OCR.** This is significant: the project can deliver a real OCR pipeline using only libraries that are already in `package.json`.

## 4. Real virus scan — feasibility

Investigation of the dev environment:

- `clamscan` — not on PATH.
- `clamd` — not on PATH.
- `tesseract` — not installed (and not a virus scanner).
- No npm AV library is installed.

The architecture rules forbid:

- Adding a new service (ClamAV daemon).
- Adding unnecessary new dependencies.

**Conclusion:** A real AV scanner (e.g., ClamAV) cannot be added in Phase 10 without violating the architecture rules. The Phase 9 magic-byte check is the strongest layer that the project can ship without those changes. Phase 10 will:

- Preserve the Phase 9 `file-safety.ts` unchanged.
- Extend the magic-byte coverage to address one more obvious gap (Office legacy `.doc`/`.xls` OLE streams: already covered in Phase 9, no change needed).
- Document honestly that the file-safety layer is a defense-in-depth structural check, **not** a real AV scanner, and that real ClamAV integration is deferred to a deployment-specific future phase (because it requires the deployment to ship a `clamd` daemon).

## 5. Existing document lifecycle

The processing state machine in `src/lib/document-processing/processor.ts` is:

```
PENDING → PROCESSING → READY
PENDING → PROCESSING → FAILED
PENDING → PROCESSING → UNSUPPORTED  (for image/* in the current pipeline)
```

Phase 9 already implemented `PENDING → PROCESSING → READY` for text documents. Phase 10 will change the `image/*` terminal state from `UNSUPPORTED` to:

```
PENDING → PROCESSING → OCR → READY   (if OCR succeeds, text reaches the existing
                                     chunking / embedding / RAG pipeline)
PENDING → PROCESSING → OCR → FAILED  (if OCR fails for any reason)
PENDING → PROCESSING → OCR → UNSUPPORTED  (only if the OCR library itself is
                                          unavailable — different from "image
                                          was always UNSUPPORTED")
```

This change touches:

- `src/lib/document-processing/processor.ts` — remove images from `UNSUPPORTED_MIME_TYPES`, OR add a new pre-check that defers to the OCR processor.
- `src/lib/document-processing/ocr-processor.ts` — NEW file: the OCR processor implementation.
- `src/lib/document-processing/processing-service.ts` — wire the OCR processor into `getProcessor()` and run the OCR text through the same `normalizeText` / `generateChunks` / `processDocumentEmbeddings` pipeline.

## 6. Idempotency / duplicate processing

The current pipeline's `processDocument` already deletes old chunks before re-processing (`tx.documentChunk.deleteMany`). The OCR processor will be a `DocumentProcessor` and will be called through the same path, so it inherits the existing idempotency guarantees. No new code is required for idempotency.

## 7. Queue behavior

Phase 9's queue is unchanged. The queue already calls `processDocument`, which is what the OCR-aware version will be. No queue changes are required.

## 8. Status state machine

The existing `ProcessingStatus` union is sufficient. No new statuses are needed. `UNSUPPORTED` is retained as the "this MIME type is not supported" terminal state (e.g., for a hypothetical future video/* upload) and the OCR failure path lands on `FAILED` with a user-safe error message.

## 9. Concurrency / resource safety

The OCR pipeline downloads + warms a model. The model is loaded once and cached in process memory. Concurrency: the OCR pipeline is invoked from the existing processing queue, which is bounded at 2 concurrent jobs. Each OCR call holds the model lock for ~500ms (single image) and the model itself is in shared memory. The bounded queue prevents resource exhaustion.

The existing `MAX_FILE_SIZE = 10 * 1024 * 1024` in `src/actions/documents.ts` is sufficient: even a 10 MB PNG will be passed to the OCR pipeline, but the model itself runs on the entire image without inflating it further. The model uses ~250MB RAM once loaded.

## 10. Cross-user isolation

The OCR call is part of `processDocument`, which is called only with a `documentId` from the trusted DB. The DB row's `tradeCaseId` is checked by `requireOwnedTradeCase` in the upload action. No new authorization code is needed; the existing authorization path covers OCR. A test in `verify-phase10.mts` will re-assert this.

## 11. Database

No schema change is required. The OCR processor is a `DocumentProcessor` implementation and stores its output in the existing `DocumentChunk` and `DocumentChunkEmbedding` tables via the existing chunking + embedding services.

## 12. Conclusion

Phase 10 scope, established from evidence:

1. **Add a real OCR processor** that uses the already-installed `@xenova/transformers` `image-to-text` pipeline with the `Xenova/trocr-small-printed` model. Wire it into the existing `processDocument` flow so that the OCR'd text enters the existing chunking / embedding / RAG pipeline.
2. **Preserve all Phase 9 work** unchanged.
3. **Document honestly** that real virus scanning (ClamAV) is not in scope for this phase due to the architecture rules, and that the magic-byte check in Phase 9 remains the strongest available layer.
4. **Write `verify-phase10.mts`** with at least the following sections: (a) OCR pipeline loads in the test environment; (b) OCR extracts text from a rendered fixture; (c) Image upload no longer lands in `UNSUPPORTED`; (d) Image upload reaches `READY` with chunks; (e) Image upload reaches `READY` with embeddings; (f) Cross-user isolation; (g) Failed OCR (corrupted image) lands in `FAILED`; (h) Phase 3/7/8/9 regressions still pass.
5. **Write `PHASE10-FINAL-REPORT.md`** with 33 sections.
