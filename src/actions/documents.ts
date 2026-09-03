"use server";

import { prisma } from "@/lib/db/prisma";
import { updateDocumentSchema } from "@/lib/validations/document";
import { revalidatePath } from "next/cache";
import { storage } from "@/lib/storage";
import { ProcessingStatus } from "@/lib/document-processing/processor";
import { scanBuffer } from "@/lib/document-processing/file-safety";
import { enqueueDocumentProcessing } from "@/lib/document-processing/processing-queue";
import { log } from "@/lib/log";
import { recordAuditEvent } from "@/lib/audit/log";
import { tryClaim, release } from "@/lib/util/inflight";
import {
  requireAuth,
  requireOwnedTradeCase,
  getCurrentUserId,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";
import crypto from "crypto";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  "image/png",
  "image/jpeg",
];

// ─── Create Document (Upload) ────────────────────────────────────────────────

export async function uploadDocument(tradeCaseId: string, formData: FormData) {
  let tempFileRef: string | null = null;

  // Phase 16: server-side in-flight guard. Keyed by (case, file name,
  // file size) so two distinct uploads to the same case don't block
  // each other. The client UI prevents double-submit, but a network
  // retry can re-send the FormData and a duplicate would create two
  // Document rows pointing at two file paths.
  const file = formData.get("file") as File | null;
  const claimKey = file
    ? `upload:${tradeCaseId}:${file.name}:${file.size}`
    : `upload:${tradeCaseId}:no-file`;
  if (!tryClaim(claimKey)) {
    return { success: false, error: "This file is already being uploaded. Please wait for it to finish." };
  }

  try {
    // Security: must be signed in AND own this trade case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // 1. Verify Trade Case exists and is active (Phase 13: also filter
    //    soft-deleted cases out — uploading to a deleted case would
    //    leak through the document list and processing pipeline).
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id: tradeCaseId, deletedAt: null },
      select: { id: true, userId: true },
    });

    if (!tradeCase) {
      return { success: false, error: "Trade case not found." };
    }

    // 2. Validate input
    // (file was already extracted above for the in-flight claim key)
    const type = formData.get("type") as string | null;
    let name = formData.get("name") as string | null;

    if (!file) {
      return { success: false, error: "Please choose a file to upload." };
    }
    
    if (!type) {
      return { success: false, error: "Document type is required." };
    }

    if (!name || name.trim() === "") {
      name = file.name; // fallback to original file name
    }

    // 3. File Validation
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "This file is too large. Please choose a file smaller than 10 MB." };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: "This file type isn't supported. Please upload a PDF, Word, Excel, CSV, PNG, or JPG file." };
    }

    // 4. Read the file into memory so we can run a defense-in-depth
    //    safety check on the raw bytes BEFORE writing to disk. The
    //    MIME-type allow-list is the first line of defense; this is
    //    the second. See src/lib/document-processing/file-safety.ts.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safetyResult = scanBuffer(buffer, file.type);
    if (!safetyResult.safe) {
      log.warn("documents:upload", "rejected by file-safety check", {
        tradeCaseId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        reason: safetyResult.reason,
      });
      return { success: false, error: safetyResult.reason };
    }

    // 5. Generate Safe Storage Key
    const ext = path.extname(file.name) || "";
    const safeKey = `${crypto.randomUUID()}${ext}`;

    // 6. Store File
    tempFileRef = await storage.upload(file, safeKey);

    // 7. Create DB Record
    const doc = await prisma.document.create({
      data: {
        tradeCaseId,
        name,
        type,
        status: "Added",
        fileRef: tempFileRef,
        mimeType: file.type,
        size: file.size,
        processingStatus: ProcessingStatus.PENDING,
      },
    });
    await recordAuditEvent({
      userId,
      action: "DOCUMENT_CREATED",
      target: "Document",
      targetId: doc.id,
      metadata: {
        tradeCaseId,
        name,
        type,
        mimeType: file.type,
        size: file.size,
      },
    });

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    // 8. Enqueue background processing (Phase 9). The upload response
    //    returns immediately; the worker picks the job up and runs
    //    text extraction + chunking + embeddings. The DB row's
    //    `processingStatus` is the source of truth the UI polls.
    //    The previous synchronous `await processDocument(...)` is
    //    replaced by the queue. The user can still retry a failed
    //    document via the existing `retryDocumentProcessing` action
    //    in src/actions/processing.ts, which stays synchronous with
    //    bounded retries (user-initiated actions want a result).
    enqueueDocumentProcessing(doc.id);

    return { success: true, id: doc.id };
  } catch (error) {
    console.error("Failed to upload document:", error);
    
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to upload documents." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    
    // Cleanup orphaned file if DB creation failed
    if (tempFileRef) {
      try {
        await storage.delete(tempFileRef);
      } catch (cleanupError) {
        console.error("Failed to clean up orphaned file:", cleanupError);
      }
    }
    
    return { success: false, error: "We couldn't upload this document. Please try again." };
  } finally {
    // Phase 16: always release the in-flight claim, even on error.
    release(claimKey);
  }
}

// ─── Update Document Metadata ────────────────────────────────────────────────

export async function updateDocument(
  tradeCaseId: string,
  documentId: string,
  formData: unknown
) {
  try {
    // Security: enforce signed-in + ownership of the parent case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Verify ownership: document must belong to this trade case and
    // not be soft-deleted (Phase 13).
    const existing = await prisma.document.findFirst({
      where: { id: documentId, tradeCaseId, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: "Document not found." };
    }

    const validatedData = updateDocumentSchema.parse(formData);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        name: validatedData.name,
        type: validatedData.type,
        status: validatedData.status,
        description: validatedData.description,
      },
    });

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update document:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to update documents." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Document not found." };
    }
    return { success: false, error: "We couldn't update this document. Please try again." };
  }
}

// ─── Delete Document ──────────────────────────────────────────────────────────

export async function deleteDocument(tradeCaseId: string, documentId: string) {
  try {
    // Security: enforce signed-in + ownership of the parent case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Verify ownership AND that the document is not already soft-deleted
    // (Phase 13). Idempotent: deleting a deleted document returns 404
    // (handled by the existing findFirst returning null).
    const existing = await prisma.document.findFirst({
      where: { id: documentId, tradeCaseId, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: "Document not found." };
    }

    // Phase 13: soft delete. The DB row, chunks, and embeddings are
    // preserved so the user can recover from /dashboard/trash. We
    // also remove the document's chunks from the FTS5 keyword index
    // so RAG search no longer surfaces the soft-deleted content; the
    // chunks are preserved on the disk-backed Prisma rows for restore.
    //
    // We do NOT delete the physical file at this point. The file is
    // deleted only when the row is hard-deleted (which is a separate
    // future-phase concern, not Phase 13).
    const deletedAt = new Date();
    await prisma.document.update({
      where: { id: documentId },
      data: { deletedAt },
    });
    await recordAuditEvent({
      userId,
      action: "DOCUMENT_DELETED",
      target: "Document",
      targetId: documentId,
      metadata: { tradeCaseId, name: existing.name, deletedAt: deletedAt.toISOString() },
    });

    // Clean up the FTS5 index so the soft-deleted content doesn't
    // surface in keyword search. Best-effort: if the FTS5 sync fails,
    // the row is marked deleted; the next rebuild-fts5 run will
    // reconcile. Orphan FTS5 rows are harmless.
    try {
      const chunkIds = await prisma.documentChunk.findMany({
        where: { documentId },
        select: { id: true },
      });
      if (chunkIds.length > 0) {
        const { ftsDeleteMany } = await import("@/lib/rag/keyword-retriever");
        await ftsDeleteMany(chunkIds.map((c) => c.id));
      }
    } catch (ftsErr) {
      console.warn(
        `[documents] FTS5 cleanup failed for document ${documentId}:`,
        ftsErr instanceof Error ? ftsErr.message : String(ftsErr)
      );
    }

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
      revalidatePath("/dashboard/trash");
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete document:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to delete documents." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Document not found." };
    }
    return { success: false, error: "We couldn't remove this document. Please try again." };
  }
}

/**
 * Phase 13: restore a soft-deleted document. Verifies the user owns
 * the document's parent case. Restoring sets `deletedAt` back to null
 * and re-syncs the document's chunks into the FTS5 keyword index so
 * RAG search works again immediately.
 */
export async function restoreDocument(tradeCaseId: string, documentId: string) {
  try {
    const userId = await requireAuth();
    if (!userId) throw new UnauthorizedError();

    // Ownership check on the parent case (excluding the deletedAt
    // filter because the parent case might be in the trash too).
    // This lets a user restore a document from a case that is also
    // soft-deleted — the case and the document both come back to life.
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id: tradeCaseId, userId },
      select: { id: true, deletedAt: true },
    });
    if (!tradeCase) {
      throw new ForbiddenError("Trade case not found.");
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, tradeCaseId },
      select: { id: true, deletedAt: true, name: true },
    });
    if (!document) {
      throw new ForbiddenError("Document not found.");
    }
    if (!document.deletedAt) {
      return { success: true, alreadyActive: true };
    }

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { deletedAt: null },
      }),
      // Bring the parent case back to active if it was deleted.
      // (This is the consistent thing to do: a user restoring a
      // document implies they want to use it, and the case being
      // deleted would make the document unreachable from the UI.)
      ...(tradeCase.deletedAt
        ? [prisma.tradeCase.update({ where: { id: tradeCaseId }, data: { deletedAt: null } })]
        : []),
    ]);
    await recordAuditEvent({
      userId,
      action: "DOCUMENT_RESTORED",
      target: "Document",
      targetId: documentId,
      metadata: { tradeCaseId, caseRestored: tradeCase.deletedAt != null },
    });

    // Re-sync the document's chunks into FTS5. Best-effort.
    try {
      const { ftsUpsertMany } = await import("@/lib/rag/keyword-retriever");
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId },
        select: { id: true, content: true },
      });
      if (chunks.length > 0) {
        await ftsUpsertMany(
          chunks.map((c) => ({ chunkId: c.id, content: c.content }))
        );
      }
    } catch (ftsErr) {
      console.warn(
        `[documents] FTS5 re-sync failed for restored document ${documentId}:`,
        ftsErr instanceof Error ? ftsErr.message : String(ftsErr)
      );
    }

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/trash");
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to restore document:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to restore a document." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Document not found." };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "We couldn't restore this document. Please try again." };
  }
}

/**
 * Phase 13: list the current user's soft-deleted documents. Used by
 * the trash UI. Returns documents whose `deletedAt` is set, scoped to
 * the signed-in user via the parent case's `userId`.
 */
export async function getDeletedDocuments() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    const docs = await prisma.document.findMany({
      where: { deletedAt: { not: null }, tradeCase: { userId } },
      select: {
        id: true,
        name: true,
        type: true,
        tradeCaseId: true,
        tradeCase: { select: { id: true, deletedAt: true, product: { select: { name: true } } } },
        deletedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      tradeCaseId: d.tradeCaseId,
      caseName: d.tradeCase.product?.name ?? "Unknown Product",
      caseDeleted: d.tradeCase.deletedAt != null,
      deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
    }));
  } catch (error) {
    console.error("Failed to fetch deleted documents:", error);
    throw new Error("Failed to fetch deleted documents from the database.");
  }
}
