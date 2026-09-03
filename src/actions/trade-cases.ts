"use server";

import { prisma } from "@/lib/db/prisma";
import { createTradeCaseSchema } from "@/lib/validations/trade-case";
import { revalidatePath } from "next/cache";
import { TradeCase, TradeCaseSection, MockProductField } from "@/lib/mock-data";
import {
  getCurrentUserId,
  requireAuth,
  requireOwnedTradeCase,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";

// Helper to format dates
function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

// Adapter to map Prisma DB output to existing Frontend Interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrismaToFrontendTradeCase(dbCase: any): TradeCase {
  // ─── Dynamic section status computation ───────────────────────────────────
  // Product: complete if product exists and has a name
  const productStatus: TradeCaseSection["status"] = dbCase.product
    ? "Complete"
    : "Needs Information";

  // Documents: complete if all documents are Added, in-progress if some are Added, not started if none
  const docs = dbCase.documents || [];
  const addedDocs = docs.filter((d: { status: string }) => d.status === "Added").length;
  let documentsStatus: TradeCaseSection["status"] = "Not Started";
  let documentsDescription = "No documents have been added yet.";
  if (docs.length === 0) {
    documentsStatus = "Not Started";
    documentsDescription = "No documents have been added yet.";
  } else if (addedDocs === docs.length) {
    documentsStatus = "Complete";
    documentsDescription = "All documents have been added.";
  } else if (addedDocs > 0) {
    documentsStatus = "In Progress";
    documentsDescription = `${addedDocs} of ${docs.length} documents added.`;
  } else {
    documentsStatus = "Needs Information";
    documentsDescription = "Documents still need to be added.";
  }

  // Requirements: complete if all confirmed, in-progress if some exist but not all confirmed, not started if none
  const reqs = dbCase.requirements || [];
  const confirmedReqs = reqs.filter((r: { status: string }) => r.status === "Confirmed").length;
  let requirementsStatus: TradeCaseSection["status"] = "Not Started";
  if (reqs.length === 0) {
    requirementsStatus = "Not Started";
  } else if (confirmedReqs === reqs.length) {
    requirementsStatus = "Complete";
  } else {
    requirementsStatus = "In Progress";
  }

  // Review: complete only if product, docs, and requirements are complete
  const reviewStatus: TradeCaseSection["status"] =
    productStatus === "Complete" && documentsStatus === "Complete" && requirementsStatus === "Complete"
      ? "In Progress"
      : "Not Started";

  const sections: TradeCaseSection[] = [
    {
      id: "trade-details",
      title: "Trade Details",
      status: "Complete",
      description: "All trade route details have been provided.",
      actionText: "View details",
      actionHref: `/cases/${dbCase.id}`,
    },
    {
      id: "product",
      title: "Product Information",
      status: productStatus,
      description: dbCase.product ? "Product details provided." : "Missing product details.",
      actionText: productStatus === "Complete" ? "View details" : "Complete details",
      actionHref: `/cases/${dbCase.id}/product`,
    },
    {
      id: "documents",
      title: "Documents",
      status: documentsStatus,
      description: documentsDescription,
      progress: docs.length > 0 ? `${addedDocs} of ${docs.length}` : undefined,
      actionText: "Manage documents",
      actionHref: `/cases/${dbCase.id}/documents`,
    },
    {
      id: "requirements",
      title: "Requirements",
      status: requirementsStatus,
      description: reqs.length > 0 
        ? (requirementsStatus === "Complete" ? "All requirements confirmed." : "Trade requirements are being reviewed.")
        : "No trade requirements added yet.",
      actionText: requirementsStatus === "Complete" ? "View requirements" : "Manage requirements",
      actionHref: `/cases/${dbCase.id}/requirements`,
    },
    {
      id: "review",
      title: "Review",
      status: reviewStatus,
      description: reviewStatus === "Not Started" ? "Complete the required sections first." : "Ready to review the case.",
      actionText: "View review",
      actionHref: `/cases/${dbCase.id}/review`,
    },
  ];

  const productFields: MockProductField[] = dbCase.product ? [
    { label: "Product name", value: dbCase.product.name },
    { label: "Product description", value: dbCase.product.description },
    { label: "Material", value: dbCase.product.material },
    { label: "Packaging", value: dbCase.product.packaging, helpText: "Packaging helps determine requirements." },
    { label: "Intended use", value: dbCase.product.intendedUse },
    { label: "Country of origin", value: dbCase.product.origin },
    { label: "Quantity", value: dbCase.product.quantity },
    { label: "Weight", value: dbCase.product.weight },
  ] : [];

  const incompleteSection = sections.find(s => s.status !== "Complete" && s.id !== "review");

  return {
    id: dbCase.id,
    productName: dbCase.product?.name || "Unknown Product",
    productDescription: dbCase.product?.description || "No description provided.",
    origin: dbCase.origin,
    destination: dbCase.destination,
    direction: dbCase.direction as "export" | "import",
    status: dbCase.status as TradeCase["status"],
    shipmentDate: dbCase.shipmentDate || "Unknown",
    estimatedValue: dbCase.estimatedValue || "Unknown",
    lastUpdated: formatDate(dbCase.updatedAt),
    nextAction: incompleteSection ? `Complete ${incompleteSection.title.toLowerCase()}` : "Ready for review",
    nextActionHref: incompleteSection ? incompleteSection.actionHref : `/cases/${dbCase.id}/review`,
    sections,
    documents: docs.map((d: { id: string; name: string; type?: string; status: string; description: string | null; size: number | null; fileRef: string | null; processingStatus: string | null; embeddingStatus: string | null; createdAt: Date; _count?: { chunks: number }; _evidenceCount?: number }) => {
      // Phase 15: evidence count is pre-aggregated in the caller
      // (getTradeCaseById) via a single groupBy / findMany; the per-chunk
      // _count path is gone.
      const evidenceCount = d._evidenceCount ?? 0;
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        description: d.description,
        size: d.size,
        fileRef: d.fileRef,
        processingStatus: d.processingStatus,
        embeddingStatus: d.embeddingStatus,
        chunkCount: d._count?.chunks || null,
        evidenceCount,
        uploadedAt: d.createdAt ? d.createdAt.toISOString() : undefined,
      };
    }),
    productFields,
    requirements: (dbCase.requirements || []).map((r: { id: string; title: string; status: string; source: string | null }) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      source: r.source,
    })),
  };
}

export async function createTradeCase(formData: unknown) {
  try {
    const validatedData = createTradeCaseSchema.parse(formData);
    
    // Security: Use the authenticated session's userId — never fall back to findFirst().
    const userId = await requireAuth();

    const tradeCase = await prisma.tradeCase.create({
      data: {
        userId,
        direction: validatedData.direction,
        origin: validatedData.origin,
        destination: validatedData.destination,
        shipmentDate: validatedData.date,
        estimatedValue: validatedData.value,
        status: "Draft",
        product: {
          create: {
            name: validatedData.productName,
            category: validatedData.category,
            description: validatedData.description,
          }
        }
      },
    });
    await recordAuditEvent({
      userId,
      action: "TRADE_CASE_CREATED",
      target: "TradeCase",
      targetId: tradeCase.id,
      metadata: {
        origin: validatedData.origin,
        destination: validatedData.destination,
        direction: validatedData.direction,
        productName: validatedData.productName,
      },
    });
    try {
      revalidatePath("/dashboard");
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }
    return { success: true, id: tradeCase.id };
  } catch (error) {
    console.error("Failed to create trade case:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to create a trade case." };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create trade case due to an unknown error." };
  }
}

export async function getTradeCases() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      // Unauthenticated: return empty list rather than leaking all cases
      return [];
    }
    const cases = await prisma.tradeCase.findMany({
      where: { userId, deletedAt: null },
      include: {
        product: true,
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return cases.map(mapPrismaToFrontendTradeCase);
  } catch (error) {
    console.error("Failed to fetch trade cases:", error);
    throw new Error("Failed to fetch trade cases from the database.");
  }
}

export async function getTradeCaseById(id: string) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return undefined;

    // Ownership-scoped fetch: a user can only see their own cases.
    // Phase 13: also filter out soft-deleted cases and their
    // soft-deleted documents from normal reads.
    //
    // Phase 15 (performance): the previous implementation pulled every
    // chunk row with its evidence _count just to sum evidenceCount
    // per document. That is an N+1 over chunks. Replace it with two
    // queries that do the same work in O(1) round-trips:
    //   (a) the case + product + document metadata + chunk count per
    //       document, and
    //   (b) a single groupBy on EvaluationEvidence that returns the
    //       evidence count per document for THIS case.
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        product: true,
        documents: {
          where: { deletedAt: null },
          include: {
            _count: {
              select: { chunks: true }
            }
          }
        },
        requirements: true,
      }
    });

    if (!tradeCase) return undefined;

    // Pre-aggregate evidence counts per document for this case in a
    // single query. The EvaluationEvidence model only links to a
    // DocumentChunk; we therefore join through chunk to filter by
    // documentId. The pre-aggregated map is what the mapper reads
    // for the per-document evidenceCount field.
    let evidenceCounts: Map<string, number> = new Map();
    const docIds = tradeCase.documents.map((d) => d.id);
    if (docIds.length > 0) {
      // Pull every evidence row whose chunk belongs to one of this
      // case's active documents. The result is small (one row per
      // evidence citation) and the per-chunk filter uses the
      // DocumentChunk.documentId index.
      const rows = await prisma.evaluationEvidence.findMany({
        where: {
          chunk: { documentId: { in: docIds } },
        },
        select: {
          chunk: { select: { documentId: true } },
        },
      });
      for (const r of rows) {
        const docId = r.chunk?.documentId;
        if (docId) {
          evidenceCounts.set(docId, (evidenceCounts.get(docId) ?? 0) + 1);
        }
      }
    }

    // Splice evidenceCount onto each document so mapPrismaToFrontendTradeCase
    // sees the same shape it had before.
    const documentsWithCounts = tradeCase.documents.map((d) => ({
      ...d,
      // Compute the evidence count from our pre-aggregated map. Default 0.
      _evidenceCount: evidenceCounts.get(d.id) ?? 0,
    }));

    return mapPrismaToFrontendTradeCase({ ...tradeCase, documents: documentsWithCounts });
  } catch (error) {
    console.error("Failed to fetch trade case by ID:", error);
    throw new Error("Failed to fetch trade case details from the database.");
  }
}

export async function updateTradeCase(id: string, formData: unknown) {
  try {
    const validatedData = createTradeCaseSchema.parse(formData); // same schema for now
    
    // Security: verify the caller is signed in AND owns this trade case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, id);

    const tradeCase = await prisma.tradeCase.update({
      where: { id },
      data: {
        direction: validatedData.direction,
        origin: validatedData.origin,
        destination: validatedData.destination,
        shipmentDate: validatedData.date,
        estimatedValue: validatedData.value,
        product: {
          upsert: {
            create: {
              name: validatedData.productName,
              category: validatedData.category,
              description: validatedData.description,
            },
            update: {
              name: validatedData.productName,
              category: validatedData.category,
              description: validatedData.description,
            }
          }
        }
      },
    });
    await recordAuditEvent({
      userId,
      action: "TRADE_CASE_UPDATED",
      target: "TradeCase",
      targetId: id,
      metadata: {
        origin: validatedData.origin,
        destination: validatedData.destination,
        direction: validatedData.direction,
        productName: validatedData.productName,
      },
    });
    try {
      revalidatePath("/dashboard");
      revalidatePath(`/cases/${id}`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }
    
    return { success: true, id: tradeCase.id };
  } catch (error) {
    console.error("Failed to update trade case:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to update a trade case." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update trade case due to an unknown error." };
  }
}

export async function deleteTradeCase(id: string) {
  try {
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, id);

    // Phase 13: soft delete. The DB row, its documents, chunks,
    // embeddings, requirements, and evaluations are all preserved.
    // They disappear from normal queries, RAG retrieval, and the
    // processing queue. The user can recover from /dashboard/trash.
    const deletedAt = new Date();
    await prisma.tradeCase.update({
      where: { id },
      data: { deletedAt },
    });
    await recordAuditEvent({
      userId,
      action: "TRADE_CASE_DELETED",
      target: "TradeCase",
      targetId: id,
      metadata: { deletedAt: deletedAt.toISOString() },
    });

    try {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/trash");
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to delete trade case:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to delete a trade case." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete trade case due to an unknown error." };
  }
}

/**
 * Phase 13: restore a soft-deleted trade case. Ownership is verified
 * without the `deletedAt: null` filter so the user can recover their
 * own trash. Restoring sets `deletedAt` back to null. Documents that
 * were deleted while the case was in the trash stay deleted; the
 * case itself returns to normal lists.
 */
export async function restoreTradeCase(id: string) {
  try {
    const userId = await requireAuth();
    if (!userId) throw new UnauthorizedError();
    if (!id) throw new ForbiddenError("Trade case not found.");

    // Verify ownership including soft-deleted rows. We deliberately do
    // NOT use requireOwnedTradeCase here because that helper excludes
    // soft-deleted cases (which is the right behavior for every
    // other code path).
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id, userId },
      select: { id: true, deletedAt: true },
    });
    if (!tradeCase) {
      throw new ForbiddenError("Trade case not found.");
    }
    if (!tradeCase.deletedAt) {
      // Already active — idempotent no-op.
      return { success: true, alreadyActive: true };
    }

    await prisma.tradeCase.update({
      where: { id },
      data: { deletedAt: null },
    });
    await recordAuditEvent({
      userId,
      action: "TRADE_CASE_RESTORED",
      target: "TradeCase",
      targetId: id,
    });

    try {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/trash");
      revalidatePath(`/cases/${id}`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to restore trade case:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to restore a trade case." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to restore trade case due to an unknown error." };
  }
}

/**
 * Phase 13: list the current user's soft-deleted trade cases for the
 * trash UI. Returns the same frontend shape as getTradeCases but
 * only includes rows where `deletedAt` is set.
 */
export async function getDeletedTradeCases() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    const cases = await prisma.tradeCase.findMany({
      where: { userId, NOT: { deletedAt: null } },
      include: {
        product: true,
        documents: {
          where: { deletedAt: null },
          select: { id: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return cases.map((c) => ({
      id: c.id,
      productName: c.product?.name ?? "Unknown Product",
      status: c.status,
      deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
      documentCount: c.documents.length,
      origin: c.origin,
      destination: c.destination,
    }));
  } catch (error) {
    console.error("Failed to fetch deleted trade cases:", error);
    throw new Error("Failed to fetch deleted trade cases from the database.");
  }
}
