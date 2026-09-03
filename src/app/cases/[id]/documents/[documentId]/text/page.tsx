import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function DocumentTextPage({
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

  // Verify document and case exist together, the case belongs to the
  // current user, and neither is soft-deleted (Phase 13).
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      tradeCaseId: id,
      deletedAt: null,
      tradeCase: { userId, deletedAt: null },
    },
    include: {
      tradeCase: true,
      chunks: {
        orderBy: { chunkIndex: "asc" },
        include: { embeddings: true },
      },
    },
  });

  if (!doc) {
    notFound();
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Case Details", href: `/cases/${id}` },
          { label: "Documents", href: `/cases/${id}/documents` },
          { label: "Extracted Text" },
        ]}
      />

      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
          {doc.name} (Extracted Text)
        </h1>
        <p className="text-sm text-slate-500">
          Extraction Status: <strong className="text-slate-700">{doc.processingStatus}</strong>
          {doc.processingError && (
            <span className="text-error-600 block mt-1">Error: {doc.processingError}</span>
          )}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Embedding Status: <strong className="text-slate-700">{doc.embeddingStatus || "Not started"}</strong>
          {doc.embeddingError && (
            <span className="text-error-600 block mt-1">Error: {doc.embeddingError}</span>
          )}
        </p>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="bg-slate-50 border-b border-border px-4 py-2 flex items-center justify-between rounded-t-lg text-sm text-slate-600">
          <span>{doc.mimeType || "Unknown type"}</span>
          {doc.size && <span>{Math.round(doc.size / 1024)} KB</span>}
        </div>
        
        <div className="p-4">
          {doc.extractedText ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 bg-slate-50 p-4 rounded border border-slate-200 max-h-[70vh] overflow-y-auto">
              {doc.extractedText}
            </pre>
          ) : (
            <div className="text-center py-12 text-slate-500 italic">
              No text has been extracted for this document yet.
            </div>
          )}
        </div>
      </div>
      
      {doc.chunks && doc.chunks.length > 0 && (
        <div className="mt-8 border-t border-border pt-8">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-4">
            Generated Chunks ({doc.chunks.length})
          </h2>
          <div className="space-y-4">
            {doc.chunks.map((chunk) => (
              <div key={chunk.id} className="bg-white border border-border rounded-lg shadow-sm">
                <div className="bg-slate-50 border-b border-border px-4 py-2 flex items-center justify-between rounded-t-lg text-sm text-slate-600">
                  <span className="font-medium">Chunk #{chunk.chunkIndex}</span>
                  <div className="flex gap-4">
                    <span>{chunk.characterCount} chars</span>
                    {chunk.embeddings && chunk.embeddings.length > 0 ? (
                      <span className="text-success-600 font-medium flex gap-2" title={`Model: ${chunk.embeddings[0].model}`}>
                        ✓ Vectorized ({chunk.embeddings[0].provider} - {chunk.embeddings[0].dimensions}d)
                      </span>
                    ) : (
                      <span className="text-slate-400">No embedding</span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 bg-slate-50 p-4 rounded border border-slate-200">
                    {chunk.content}
                  </pre>
                  {chunk.embeddings && chunk.embeddings.length > 0 && (
                    <div className="mt-3 text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-100 overflow-x-auto whitespace-nowrap">
                      Vector Preview: [ {JSON.parse(chunk.embeddings[0].vector).slice(0, 5).map((n: number) => n.toFixed(4)).join(", ")} ... ]
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="mt-6 flex gap-4">
        <Link 
          href={`/cases/${id}/documents`}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          ← Back to Documents
        </Link>
        {doc.fileRef && (
          <a
            href={`/api/cases/${id}/documents/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            View Original File ↗
          </a>
        )}
      </div>
    </div>
  );
}
