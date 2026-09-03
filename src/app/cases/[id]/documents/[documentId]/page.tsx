import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getCurrentUserId } from "@/lib/auth/session";
import { DocumentDetailClient } from "./DocumentDetailClient";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;

  // Security: must be signed in.
  const userId = await getCurrentUserId();
  if (!userId) {
    notFound();
  }

  // Verify document exists, its case belongs to the current user,
  // AND neither is soft-deleted (Phase 13).
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      tradeCaseId: id,
      deletedAt: null,
      tradeCase: { userId, deletedAt: null },
    },
    include: {
      tradeCase: {
        select: { id: true, product: { select: { name: true } } },
      },
      _count: { select: { chunks: true } },
    },
  });

  if (!doc) {
    notFound();
  }

  // Pull related requirements via evaluation evidence (the traceability chain).
  // Also pre-aggregate the evidence count for this document via a single
  // count query — the previous shape pulled every chunk row just to sum
  // the per-chunk evidence counts (Phase 16).
  const [relatedRequirements, evidenceCount] = await Promise.all([
    prisma.requirement.findMany({
      where: {
        tradeCaseId: id,
        evaluation: {
          evidences: {
            some: {
              chunk: { documentId: doc.id },
            },
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    }),
    prisma.evaluationEvidence.count({
      where: { chunk: { documentId: doc.id } },
    }),
  ]);

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Case Details", href: `/cases/${id}` },
          { label: "Documents", href: `/cases/${id}/documents` },
          { label: doc.name },
        ]}
      />

      <DocumentDetailClient
        tradeCaseId={id}
        document={{
          id: doc.id,
          name: doc.name,
          type: doc.type,
          status: doc.status,
          description: doc.description,
          size: doc.size,
          fileRef: doc.fileRef,
          mimeType: doc.mimeType,
          processingStatus: doc.processingStatus,
          embeddingStatus: doc.embeddingStatus,
          processingError: doc.processingError,
          embeddingError: doc.embeddingError,
          uploadedAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
          chunkCount: doc._count?.chunks ?? 0,
          evidenceCount,
        }}
        relatedRequirements={relatedRequirements}
        productName={doc.tradeCase.product?.name || "Unknown Product"}
      />
    </div>
  );
}
