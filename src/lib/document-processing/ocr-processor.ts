/**
 * Phase 10 — Real OCR processor for image documents.
 *
 * This is the OCR extension of the existing `DocumentProcessor` pipeline.
 * It runs an on-device TrOCR (Transformer-based OCR) model via the
 * already-installed `@xenova/transformers` library — the same library
 * that powers the existing `LocalEmbeddingProvider`. No new dependencies
 * were added for Phase 10.
 *
 * ## What it does
 *
 * 1. Accepts an image buffer (PNG / JPEG).
 * 2. Decodes it into a `RawImage` (the format `pipeline("image-to-text")`
 *    expects).
 * 3. Runs the `Xenova/trocr-small-printed` model (an on-device ONNX port
 *    of Microsoft's TrOCR, ~250 MB after first download).
 * 4. Returns the recognized text as a single string, which the existing
 *    `processDocument` flow feeds into `normalizeText → generateChunks →
 *    processDocumentEmbeddings` — i.e., the OCR'd text reaches RAG the
 *    same way text-extracted text does.
 *
 * ## Model lifecycle
 *
 * The model is loaded once and cached at module scope (same pattern as
 * `LocalEmbeddingProvider`). The first call downloads the model from the
 * HuggingFace Hub; subsequent calls reuse the in-memory model.
 *
 * ## Why TrOCR
 *
 * TrOCR (Text Recognition) is specifically a printed-text recognition
 * model. It is the right tool for "extract text from a scanned
 * invoice / packing list / commercial document" — which is the
 * document-processing use case this project cares about. It is NOT a
 * general-purpose vision model and will perform poorly on handwritten
 * notes, photographs, or images that contain primarily non-text content
 * (e.g. a product photo).
 *
 * For a handwritten model, `Xenova/trocr-small-handwritten` could be
 * selected via `OCR_MODEL` env var. For the default trade-document
 * use case, `trocr-small-printed` is correct.
 *
 * ## Honest limitations
 *
 * - TrOCR runs on the image as a single block of text. Multi-line
 *   documents with small text will return a single best-guess string,
 *   not per-line text. This is sufficient for the "this image
 *   contains a known product label" use case; it is not sufficient
 *   for "I need every line of a 20-line invoice to be perfect."
 * - TrOCR is English-only out of the box. Other languages would need
 *   a different model.
 * - TrOCR cannot extract layout, tables, or visual structure. It
 *   produces plain text only.
 * - This is NOT a virus scanner and is not a substitute for
 *   the Phase 9 magic-byte safety check. The buffer is read from
 *   trusted storage (`storage.get(fileRef)`) and the upstream
 *   `scanBuffer` has already validated the file as a non-executable.
 *
 * ## Failure handling
 *
 * Any failure (model load error, image decode error, ONNX runtime
 * error) throws an Error with a sanitized message. The caller
 * (`processDocument`) catches it and stores a safe
 * "Text extraction failed: ..." message in the DB.
 */
import { DocumentProcessor } from "./processor";
import { log } from "@/lib/log";

// Supported input MIME types. Mirrors the user-facing allow-list
// in src/actions/documents.ts.
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

// Default model. Can be overridden by the OCR_MODEL env var.
const DEFAULT_MODEL_ID = "Xenova/trocr-small-printed";

/**
 * A safe, user-visible error message for the most common failure
 * modes. The internal detail (stack trace, model id, ONNX error)
 * is logged but not bubbled to the DB or the user.
 */
function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    // Truncate aggressively and keep only the high-level intent.
    if (/decode|format|invalid|corrupt/i.test(m)) {
      return "The image could not be decoded for OCR.";
    }
    if (/model|load|pipeline/i.test(m)) {
      return "The OCR model could not be loaded.";
    }
    if (/timeout|out of memory|allocation/i.test(m)) {
      return "The image was too large or complex for OCR.";
    }
    return "OCR processing failed.";
  }
  return "OCR processing failed.";
}

export class OcrProcessor implements DocumentProcessor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipelinePromise: Promise<any> | null = null;
  private readonly modelId: string;

  constructor(modelId: string = process.env.OCR_MODEL || DEFAULT_MODEL_ID) {
    this.modelId = modelId;
  }

  /**
   * Returns true if the given MIME type is supported by this processor.
   * The processing-service registry calls this to decide whether to
   * route the document here.
   */
  static supports(mimeType: string): boolean {
    return SUPPORTED_IMAGE_MIME_TYPES.has((mimeType || "").toLowerCase());
  }

  /**
   * Load the OCR pipeline. Cached at instance scope so the first
   * request pays the model-download cost and subsequent requests
   * hit the in-memory model.
   *
   * The model is downloaded from the HuggingFace Hub on first use
   * and cached under `node_modules/@xenova/transformers/.cache/`
   * (or whichever `env.cacheDir` resolves to). Subsequent runs
   * are offline-capable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const t0 = Date.now();
        log.info("ocr", "loading model", { modelId: this.modelId });
        // Dynamic import keeps the @xenova/transformers module out of
        // any path that does not need OCR (text-only documents skip
        // this entirely).
        const { pipeline, env } = await import("@xenova/transformers");
        // Use a local cache directory for the OCR model so it is
        // isolated from the embedding model's cache.
        env.cacheDir = "./.ocr-cache";
        env.allowLocalModels = true;
        const p = await pipeline("image-to-text", this.modelId, {
          quantized: true,
        });
        log.info("ocr", "model ready", {
          modelId: this.modelId,
          loadMs: Date.now() - t0,
        });
        return p;
      })().catch((err) => {
        // Reset the promise so a later call can retry the load.
        this.pipelinePromise = null;
        throw err;
      });
    }
    return this.pipelinePromise;
  }

  /**
   * Extract text from an image buffer using the OCR model.
   *
   * Returns the recognized text. Returns an empty string if the
   * model produced no text (this is treated as "no content" by
   * the downstream `hasContent` check in `processDocument`, which
   * stores READY with `extractedText: null`).
   *
   * Throws on any unrecoverable error (model load failure, image
   * decode failure). The thrown error's message is the
   * user-safe summary from `safeErrorMessage`.
   */
  async extract(buffer: Buffer): Promise<string> {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("OCR input must be a Buffer.");
    }
    if (buffer.length === 0) {
      throw new Error("OCR input is empty.");
    }

    let ocr: unknown;
    try {
      ocr = await this.getPipeline();
    } catch (err) {
      const msg = safeErrorMessage(err);
      log.error("ocr", "pipeline load failed", {
        modelId: this.modelId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(msg);
    }

    // The @xenova/transformers image-to-text pipeline expects either
    // a string file path, a URL, or a RawImage instance — it does
    // not accept a raw Buffer. We materialize the buffer to a temp
    // file and pass the path; the temp file is cleaned up in `finally`.
    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
    const tmpFile = path.join(tmpDir, "input.bin");
    try {
      await fs.writeFile(tmpFile, buffer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineFn: (input: any) => Promise<any> = ocr as any;
      let rawOutput: unknown;
      try {
        rawOutput = await pipelineFn(tmpFile);
      } catch (err) {
        const msg = safeErrorMessage(err);
        log.error("ocr", "extraction failed", {
          bytes: buffer.length,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new Error(msg);
      }
      return collectGeneratedText(rawOutput);
    } finally {
      // Best-effort cleanup of the temp file. The temp directory
      // itself is left to the OS tmp-cleanup policy.
      try {
        await fs.unlink(tmpFile);
        await fs.rmdir(tmpDir);
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Pull every `generated_text` field out of the pipeline's output
 * and join them with newlines.
 */
function collectGeneratedText(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (
        item !== null &&
        typeof item === "object" &&
        "generated_text" in item &&
        typeof (item as { generated_text: unknown }).generated_text === "string"
      ) {
        const t = (item as { generated_text: string }).generated_text.trim();
        if (t.length > 0) parts.push(t);
      }
    }
    return parts.join("\n");
  }
  if (
    typeof output === "object" &&
    output !== null &&
    "generated_text" in output &&
    typeof (output as { generated_text: unknown }).generated_text === "string"
  ) {
    return (output as { generated_text: string }).generated_text.trim();
  }
  if (typeof output === "string") {
    return output.trim();
  }
  return "";
}
