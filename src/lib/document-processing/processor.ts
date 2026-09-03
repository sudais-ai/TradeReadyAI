/**
 * DocumentProcessor interface.
 * Each format-specific processor implements this.
 */
export interface DocumentProcessor {
  /**
   * Extract text from the given file buffer.
   * Returns the raw extracted text (normalization happens in the processing service).
   */
  extract(buffer: Buffer): Promise<string>;
}

/**
 * Processing status constants.
 * These are stored in the DB processingStatus field.
 */
export const ProcessingStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  UNSUPPORTED: "UNSUPPORTED",
} as const;

export type ProcessingStatusType = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

/**
 * User-friendly labels for each processing status.
 */
export const PROCESSING_STATUS_LABELS: Record<ProcessingStatusType, string> = {
  PENDING: "Waiting to process",
  PROCESSING: "Reading document…",
  READY: "Ready for analysis",
  FAILED: "Something went wrong",
  UNSUPPORTED: "Text extraction not available",
};

/**
 * MIME types that cannot have text extracted.
 *
 * Phase 10: images are no longer in this set. They are now routed to
 * the OCR processor (OcrProcessor, src/lib/document-processing/ocr-processor.ts),
 * which uses an on-device TrOCR model to recognize printed text in
 * image documents. The OCR'd text then enters the same
 * normalize → chunk → embed → RAG pipeline as text-extracted documents.
 *
 * The empty-set default is the right place to land for now: the only
 * MIME types the upload action accepts are already supported by either
 * a text extractor (PDF/DOCX/XLSX/CSV) or the OCR processor (PNG/JPEG).
 * If a new MIME type is ever added to the upload allow-list that is
 * neither, it should be added here so `processDocument` short-circuits
 * to `UNSUPPORTED` instead of throwing.
 */
const UNSUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set();

/**
 * Returns true if this MIME type does not support text extraction
 * (neither a text extractor nor the OCR processor handles it).
 */
export function isUnsupportedForExtraction(mimeType: string): boolean {
  return UNSUPPORTED_MIME_TYPES.has(mimeType.toLowerCase());
}
