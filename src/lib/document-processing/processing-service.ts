import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { normalizeText, hasContent } from "./text-utils";
import { ProcessingStatus, isUnsupportedForExtraction, DocumentProcessor } from "./processor";
import { PdfProcessor } from "./pdf-processor";
import { DocxProcessor } from "./docx-processor";
import { SpreadsheetProcessor } from "./spreadsheet-processor";
import { OcrProcessor } from "./ocr-processor";
import { generateChunks } from "./chunking-service";
import { processDocumentEmbeddings } from "../embeddings/embedding-service";

// ─── Configuration ─────────────────────────────────────────────────────────────

const MAX_PROCESSING_RETRIES = 3;

// ─── Processor Registry ───────────────────────────────────────────────────────

function getProcessor(mimeType: string): DocumentProcessor | null {
  const mime = mimeType.toLowerCase();

  if (mime === "application/pdf") {
    return new PdfProcessor();
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    return new DocxProcessor();
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv"
  ) {
    return new SpreadsheetProcessor();
  }

  if (OcrProcessor.supports(mime)) {
    return new OcrProcessor();
  }

  return null;
}

// ─── Error Sanitization ────────────────────────────────────────────────────────

/**
 * Sanitizes error messages for safe storage and display.
 * Never exposes stack traces, file paths, or internal details.
 */
function sanitizeError(err: unknown, context: string): string {
  const baseMessage = err instanceof Error ? err.message : "An unexpected error occurred";
  // Truncate to reasonable length
  const truncated = baseMessage.slice(0, 500);
  return `${context}: ${truncated}`;
}

// ─── Main Processing Service ──────────────────────────────────────────────────

/**
 * Processes a document: reads its physical file, extracts text, and stores results.
 *
 * Security: documentId must come from trusted server-side context.
 * The fileRef is read from the trusted DB record — never from client input.
 */
export async function processDocument(documentId: string): Promise<void> {
  // 1. Find the document. Phase 13: also confirm the document AND its
  //    parent case are not soft-deleted. A document in the trash must
  //    not be processed; the user must restore it first.
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      tradeCase: { deletedAt: null },
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // 2. Check for unsupported types (images)
  if (document.mimeType && isUnsupportedForExtraction(document.mimeType)) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: ProcessingStatus.UNSUPPORTED,
        processingError: null,
      },
    });
    return;
  }

  // 3. Verify physical file exists
  if (!document.fileRef) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: ProcessingStatus.FAILED,
        processingError: "No file reference found for this document.",
      },
    });
    return;
  }

  // 4. Mark as PROCESSING
  await prisma.document.update({
    where: { id: documentId },
    data: {
      processingStatus: ProcessingStatus.PROCESSING,
      processingError: null,
    },
  });

  try {
    // 5. Read physical file from storage using trusted fileRef
    const fileBuffer = await storage.get(document.fileRef);

    if (!fileBuffer) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: "The document file could not be found in storage.",
        },
      });
      return;
    }

    // 6. Get processor for this MIME type
    const mimeType = document.mimeType ?? "";
    const processor = getProcessor(mimeType);

    if (!processor) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.UNSUPPORTED,
          processingError: null,
        },
      });
      return;
    }

    // 7. Extract text
    const rawText = await processor.extract(fileBuffer);

    // 8. Normalize text
    const cleanText = normalizeText(rawText);

    // 9. Generate chunks
    const chunks = generateChunks(cleanText);

    // 10. Update DB in a transaction to ensure consistent state
    await prisma.$transaction(async (tx) => {
      // 10a. Delete old chunks if reprocessing
      await tx.documentChunk.deleteMany({
        where: { documentId: documentId },
      });

      // 10b. Update document status
      await tx.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.READY,
          extractedText: hasContent(cleanText) ? cleanText : null,
          processedAt: new Date(),
          processingError: null,
        },
      });

      // 10c. Insert new chunks
      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((c) => ({
            documentId: documentId,
            chunkIndex: c.index,
            content: c.content,
            characterCount: c.characterCount,
          })),
        });
      }
    });

    // 11. Process embeddings for the newly generated chunks
    // This is run asynchronously/sequentially; if it fails, it will update embeddingStatus
    // but extraction/chunking status will remain READY.
    await processDocumentEmbeddings(documentId);
    
  } catch (err) {
    // Handle failure — store error safely without exposing stack traces
    const safeMessage = sanitizeError(err, "Text extraction failed");

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: ProcessingStatus.FAILED,
        processingError: safeMessage,
        processedAt: null,
      },
    });
  }
}

/**
 * Processes a document with retry logic.
 * This is used by the retry action to provide bounded retries.
 */
export async function processDocumentWithRetry(
  documentId: string,
  attempt: number = 1
): Promise<void> {
  try {
    await processDocument(documentId);
  } catch (err) {
    if (attempt < MAX_PROCESSING_RETRIES) {
      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return processDocumentWithRetry(documentId, attempt + 1);
    }
    throw err;
  }
}
