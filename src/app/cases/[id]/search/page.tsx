import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { DevSearchClient } from "./DevSearchClient";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function DevSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Security: must be signed in.
  const userId = await getCurrentUserId();
  if (!userId) {
    notFound();
  }

  // Verify the case exists AND belongs to the current user.
  const tradeCase = await prisma.tradeCase.findFirst({
    where: { id, userId },
    include: {
      product: { select: { name: true } },
      documents: {
        select: {
          id: true,
          name: true,
          processingStatus: true,
          embeddingStatus: true,
          _count: { select: { chunks: true } }
        }
      }
    }
  });

  if (!tradeCase) {
    notFound();
  }

  const embeddedDocs = tradeCase.documents.filter(d => d.embeddingStatus === "READY");
  const totalChunks = embeddedDocs.reduce((acc, doc) => acc + (doc._count.chunks || 0), 0);

  return (
    <div className="pb-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Case Details", href: `/cases/${id}` },
          { label: "Semantic Search (Dev)" },
        ]}
      />

      <PageHeader
        title="Semantic Search Inspection (Dev Tool)"
        description={
          <>
            Search against <strong className="text-slate-800">{totalChunks}</strong> embedded chunks{" "}
            from <strong className="text-slate-800">{embeddedDocs.length}</strong> ready documents in{" "}
            {tradeCase.product?.name || "this case"}.
          </>
        }
      />

      <DevSearchClient tradeCaseId={id} totalEmbeddedChunks={totalChunks} />
    </div>
  );
}
