import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { RequirementsManager } from "./RequirementsManager";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function RequirementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Security: must be signed in.
  const userId = await getCurrentUserId();
  if (!userId) {
    notFound();
  }

  // Verify ownership: only the owner can view the requirements.
  // Phase 15: trim the include so we only pull the document fields the
  // UI actually renders (id, name) and the chunk fields the UI needs
  // (id, content, chunkIndex). Drop the rest of Document (mimeType,
  // size, fileRef, processingStatus, etc.) — the requirements page
  // does not show them.
  const tradeCase = await prisma.tradeCase.findFirst({
    where: { id, userId },
    include: {
      requirements: {
        include: {
          evaluation: {
            include: {
              evidences: {
                include: {
                  chunk: {
                    select: {
                      id: true,
                      content: true,
                      chunkIndex: true,
                      document: { select: { id: true, name: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!tradeCase) {
    notFound();
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Case Details", href: `/cases/${tradeCase.id}` },
          { label: "Requirements" },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Requirements</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the trade requirements for this case.
          </p>
        </div>
        <Link href={`/cases/${tradeCase.id}`}>
          <Button variant="outline" size="sm">← Back to Case</Button>
        </Link>
      </div>

      {/* Preview notice (keeping this based on the prompt stating we are not doing RAG yet) */}
      <div className="mb-6 p-4 rounded-lg bg-primary-50 border border-primary-100 text-sm text-slate-600">
        <div className="flex gap-3 items-start">
          <svg className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-slate-700 mb-0.5">Note on requirements</p>
            <p>These requirements must be manually verified. Always confirm with the relevant authority or a qualified trade professional before shipping.</p>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <RequirementsManager
          tradeCaseId={tradeCase.id}
          initialRequirements={tradeCase.requirements}
        />
      </Suspense>
      
      {/* Evidence / Sources preview removed - AI Evidence Panel is integrated into RequirementsManager */}

      <div className="mt-8 pt-6 border-t border-border flex justify-end">
        <Link href={`/cases/${tradeCase.id}/review`}>
          <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm">
            Continue to Review →
          </Button>
        </Link>
      </div>
    </div>
  );
}
