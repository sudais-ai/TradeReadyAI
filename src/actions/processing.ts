"use server";

import { prisma } from "@/lib/db/prisma";
import { processDocumentWithRetry } from "@/lib/document-processing/processing-service";
import { processDocumentEmbeddings } from "@/lib/embeddings/embedding-service";
import { ProcessingStatus } from "@/lib/document-processing/processor";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  requireOwnedTradeCase,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";

// ─── Retry Processing ─────────────────────────────────────────────────────────

export async function retryDocumentProcessing(
  tradeCaseId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Security: enforce signed-in + ownership of the parent case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Verify ownership: document must belong to this trade case
    const document = await prisma.document.findFirst({
      where: { id: documentId, tradeCaseId },
    });

    if (!document) {
      return { success: false, error: "Document not found." };
    }

    // Only retry from FAILED state (or PENDING that got stuck)
    if (
      document.processingStatus !== ProcessingStatus.FAILED &&
      document.processingStatus !== ProcessingStatus.PENDING
    ) {
      return { success: false, error: "This document cannot be retried in its current state." };
    }

    // Reset to PENDING before processing
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: ProcessingStatus.PENDING,
        processingError: null,
      },
    });

    // Run processing with bounded retries
    await processDocumentWithRetry(documentId);

    try {
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store errors in test context
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to retry document processing:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to retry processing." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Document not found." };
    }
    // Sanitize error for user
    const safeError = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
    return { success: false, error: `Processing failed after retries: ${safeError}` };
  }
}

// ─── Retry Embedding ─────────────────────────────────────────────────────────

export async function retryEmbeddingProcessing(
  tradeCaseId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Security: enforce signed-in + ownership.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const document = await prisma.document.findFirst({
      where: { id: documentId, tradeCaseId },
    });

    if (!document) {
      return { success: false, error: "Document not found." };
    }

    if (document.processingStatus !== ProcessingStatus.READY) {
      return { success: false, error: "Document is not ready for embeddings." };
    }

    if (
      document.embeddingStatus !== ProcessingStatus.FAILED &&
      document.embeddingStatus !== ProcessingStatus.PENDING
    ) {
      return { success: false, error: "Embeddings cannot be retried in its current state." };
    }

    // Reset to PENDING
    await prisma.document.update({
      where: { id: documentId },
      data: {
        embeddingStatus: ProcessingStatus.PENDING,
        embeddingError: null,
      },
    });

    await processDocumentEmbeddings(documentId);

    try {
      revalidatePath(`/cases/${tradeCaseId}/documents`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store errors in test context
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to retry embedding processing:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to retry embeddings." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Document not found." };
    }
    const safeError = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
    return { success: false, error: `Embedding generation failed: ${safeError}` };
  }
}
