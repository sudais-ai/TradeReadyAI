import * as React from "react";
import { PROCESSING_STATUS_LABELS } from "@/lib/document-processing/processor";
import type { ProcessingStatusType } from "@/lib/document-processing/processor";

interface ProcessingStatusIndicatorProps {
  processingStatus: string | null | undefined;
  embeddingStatus?: string | null | undefined;
  chunkCount?: number | null;
}

/**
 * Inline status indicator for a document's extraction + embedding pipeline.
 * Renders nothing when the document hasn't started processing yet.
 *
 * States (per `ProcessingStatus` in `src/lib/document-processing/processor.ts`):
 *   - FAILED      → red, "Extraction failed"
 *   - UNSUPPORTED → muted, "Format not supported"
 *   - PENDING     → spinner, "Waiting to process"
 *   - PROCESSING  → spinner, "Extracting text"
 *   - READY       → splits into:
 *       - embedding FAILED  → red, "Analysis preparation failed"
 *       - embedding PENDING / PROCESSING → spinner, "Preparing for analysis…"
 *       - READY             → green, "Ready for analysis" + chunk count
 */
export function ProcessingStatusIndicator({
  processingStatus,
  embeddingStatus,
  chunkCount,
}: ProcessingStatusIndicatorProps) {
  if (!processingStatus) return null;

  if (processingStatus === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-error-600 font-medium">
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        {PROCESSING_STATUS_LABELS.FAILED}
      </span>
    );
  }

  if (processingStatus === "UNSUPPORTED") {
    return (
      <span className="text-xs text-slate-400">{PROCESSING_STATUS_LABELS.UNSUPPORTED}</span>
    );
  }

  if (processingStatus === "PENDING" || processingStatus === "PROCESSING") {
    const label =
      processingStatus === "PENDING"
        ? PROCESSING_STATUS_LABELS.PENDING
        : PROCESSING_STATUS_LABELS.PROCESSING;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        {label}
      </span>
    );
  }

  if (processingStatus === "READY") {
    if (embeddingStatus === "FAILED") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-error-600 font-medium">
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          Analysis preparation failed
        </span>
      );
    }

    if (embeddingStatus === "PENDING" || embeddingStatus === "PROCESSING") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Preparing for analysis…
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 text-xs text-success-700 font-medium">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Ready for analysis
        </span>
        {typeof chunkCount === "number" && chunkCount > 0 && (
          <span className="text-xs text-slate-500 font-normal">
            · {chunkCount} {chunkCount === 1 ? "section" : "sections"} prepared
          </span>
        )}
      </span>
    );
  }

  return <span className="text-xs text-slate-400">Unknown status</span>;
}

// Re-export the type for convenience
export type { ProcessingStatusType };
