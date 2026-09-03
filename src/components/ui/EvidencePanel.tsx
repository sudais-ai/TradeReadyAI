"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "./Button";

interface EvidenceData {
  id: string;
  chunkId: string;
  reason: string | null;
  documentName: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

interface EvidencePanelProps {
  evidences: EvidenceData[];
  caseId: string;
}

export function EvidencePanel({ evidences, caseId }: EvidencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (evidences.length === 0) {
    return (
      <div className="mt-3 text-sm text-slate-500 italic">
        No specific evidence found in documents.
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Supporting Evidence ({evidences.length})
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 text-xs px-2 text-primary-600 hover:text-primary-700 hover:bg-primary-50"
        >
          {isExpanded ? "Hide Evidence" : "View Evidence"}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {evidences.map((evidence, idx) => (
            <div key={evidence.id || idx} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0">
                  <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <Link
                    href={`/cases/${caseId}/documents/${evidence.documentId}`}
                    className="text-primary-600 hover:text-primary-700 hover:underline truncate"
                    title={`Open ${evidence.documentName}`}
                  >
                    {evidence.documentName}
                  </Link>
                  <span className="text-slate-400 font-normal shrink-0">Part {evidence.chunkIndex + 1}</span>
                </div>
              </div>

              {evidence.reason && (
                <div className="mb-3 text-slate-700 bg-white p-2 rounded border border-slate-100 shadow-sm">
                  <span className="font-semibold text-slate-900 mr-1">AI Note:</span>
                  {evidence.reason}
                </div>
              )}

              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-200 rounded-full" />
                <p className="pl-3 text-slate-600 text-xs font-serif leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                  &quot;{evidence.content}&quot;
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
