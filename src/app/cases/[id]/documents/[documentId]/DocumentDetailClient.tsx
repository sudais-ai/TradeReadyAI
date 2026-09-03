"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProcessingStatusIndicator } from "@/components/documents/ProcessingStatusIndicator";

interface DocumentDetail {
  id: string;
  name: string;
  type: string | null;
  status: string;
  description: string | null;
  size: number | null;
  fileRef: string | null;
  mimeType: string | null;
  processingStatus: string | null;
  embeddingStatus: string | null;
  processingError: string | null;
  embeddingError: string | null;
  uploadedAt: string;
  updatedAt: string;
  chunkCount: number;
  evidenceCount: number;
}

interface RelatedRequirement {
  id: string;
  title: string;
  status: string;
}

interface DocumentDetailClientProps {
  tradeCaseId: string;
  document: DocumentDetail;
  relatedRequirements: RelatedRequirement[];
  productName: string;
}

function formatBytes(bytes: number | null, decimals = 2): string {
  if (!bytes || !+bytes) return "Unknown size";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getStatusBadgeVariant(status: string): "default" | "success" | "warning" | "error" | "outline" {
  switch (status) {
    case "Added": return "success";
    case "Pending": return "warning";
    case "Reviewed": return "outline";
    default: return "default";
  }
}

/**
 * In-app Document Detail view.
 * Renders a "future-compatible preview area" for the original file plus
 * metadata, processing status, evidence count, and related requirements.
 */
export function DocumentDetailClient({
  tradeCaseId,
  document: initialDoc,
  relatedRequirements: initialRequirements,
  productName,
}: DocumentDetailClientProps) {
  const router = useRouter();
  const [doc, setDoc] = React.useState(initialDoc);
  const [relatedRequirements, setRelatedRequirements] = React.useState(initialRequirements);

  // Phase 16: poll for processing status updates. We do this
  // client-side via router.refresh() — the server re-renders the page
  // with the latest processing/embedding status. Polling stops the
  // moment the status reaches a terminal state (READY, FAILED,
  // UNSUPPORTED) so we don't keep hitting the server. The interval
  // is 3 s for a snappy feel, and we cap at 5 minutes of polling
  // to bound the lifetime in case the worker is stuck (operator can
  // still trigger a manual refresh from the documents list).
  const inFlight = doc.processingStatus === "PENDING" || doc.processingStatus === "PROCESSING"
    || doc.embeddingStatus === "PENDING" || doc.embeddingStatus === "PROCESSING";
  React.useEffect(() => {
    if (!inFlight) return;
    const startedAt = Date.now();
    const MAX_POLL_MS = 5 * 60 * 1000;
    const id = window.setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        window.clearInterval(id);
        return;
      }
      // Soft refresh: Next.js re-runs the server component for this
      // route and re-applies the props. The page does not unmount;
      // any state we set via setDoc/setRelatedRequirements below is
      // preserved across the refresh. We also update local state from
      // the new server-rendered doc so the spinner animates from the
      // new status immediately.
      router.refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [inFlight, router]);

  // After each refresh, sync the local state from the new server-rendered
  // props. router.refresh() does not pass new props to the existing
  // component instance, so we mirror the source-of-truth in a ref-style
  // effect: when the parent's `doc` prop changes, copy it into our
  // local state. This avoids a flash of stale data between refreshes.
  React.useEffect(() => {
    setDoc(initialDoc);
  }, [initialDoc]);
  React.useEffect(() => {
    setRelatedRequirements(initialRequirements);
  }, [initialRequirements]);

  const canPreview = doc.processingStatus === "READY" && doc.chunkCount > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 truncate">
              {doc.name}
            </h1>
            <Badge variant={getStatusBadgeVariant(doc.status)}>{doc.status}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {doc.type ? `${doc.type} · ` : ""}
            {productName ? `Part of ${productName}` : ""}
          </p>
        </div>
        <Link href={`/cases/${tradeCaseId}/documents`}>
          <Button variant="ghost" size="sm">← Back to Documents</Button>
        </Link>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
        <MetaCell label="Document type" value={doc.type || "—"} />
        <MetaCell label="File size" value={formatBytes(doc.size)} />
        <MetaCell label="MIME type" value={doc.mimeType || "—"} />
        <MetaCell label="Uploaded" value={formatDate(doc.uploadedAt)} />
        <MetaCell label="Last updated" value={formatDate(doc.updatedAt)} />
        <MetaCell
          label="Evidence items"
          value={
            doc.evidenceCount > 0 ? (
              <span>
                {doc.evidenceCount} {doc.evidenceCount === 1 ? "item" : "items"} across{" "}
                {relatedRequirements.length} {relatedRequirements.length === 1 ? "requirement" : "requirements"}
              </span>
            ) : (
              <span className="text-slate-400">No evidence yet</span>
            )
          }
        />
      </div>

      {/* Processing status */}
      <section className="rounded-lg border border-border bg-surface p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Processing status</h2>
        <ProcessingStatusIndicator
          processingStatus={doc.processingStatus}
          embeddingStatus={doc.embeddingStatus}
          chunkCount={doc.chunkCount}
        />
        {doc.processingError && (
          <p className="text-xs text-error-600 mt-2">
            <strong>Error:</strong> {doc.processingError}
          </p>
        )}
        {doc.embeddingError && (
          <p className="text-xs text-error-600 mt-1">
            <strong>Analysis error:</strong> {doc.embeddingError}
          </p>
        )}
      </section>

      {/* Future-compatible preview area */}
      <section className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="bg-slate-50 border-b border-border px-4 py-2 flex items-center justify-between text-sm text-slate-600">
          <span className="font-medium">Document preview</span>
          <span className="text-xs text-slate-400">In-app rendering pending</span>
        </div>
        <div className="p-6">
          {canPreview ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {doc.chunkCount} {doc.chunkCount === 1 ? "section" : "sections"} extracted
                and ready for analysis.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/cases/${tradeCaseId}/documents/${doc.id}/text`}>
                  <Button variant="outline" size="sm">View extracted text</Button>
                </Link>
                {doc.fileRef && (
                  <a
                    href={`/api/cases/${tradeCaseId}/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="primary" size="sm">Open original file ↗</Button>
                  </a>
                )}
              </div>
            </div>
          ) : doc.processingStatus === "FAILED" ? (
            <p className="text-sm text-slate-500">
              Extraction failed for this document. Use “Try Again” on the documents list
              to retry processing.
            </p>
          ) : doc.processingStatus === "UNSUPPORTED" ? (
            <p className="text-sm text-slate-500">
              This file format isn’t supported for in-app preview. The original file is
              still available for download.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              This document is still being processed. Preview will be available shortly.
            </p>
          )}
        </div>
      </section>

      {/* Description */}
      {doc.description && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Description</h2>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{doc.description}</p>
        </section>
      )}

      {/* Related requirements */}
      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Requirements referencing this document
        </h2>
        {relatedRequirements.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">
              No requirements currently reference this document.
            </p>
            <Link href={`/cases/${tradeCaseId}/requirements`} className="mt-3 inline-block">
              <Button variant="ghost" size="sm">View requirements →</Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {relatedRequirements.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/cases/${tradeCaseId}/requirements`}
                  className="block p-3 rounded-lg border border-border bg-surface hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {r.title}
                    </span>
                    <Badge variant={r.status === "Confirmed" ? "success" : "warning"}>
                      {r.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}
