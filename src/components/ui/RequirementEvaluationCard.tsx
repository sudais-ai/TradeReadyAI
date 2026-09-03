"use client";

import { EvidencePanel } from "./EvidencePanel";
import { Badge } from "./Badge";

interface EvidenceData {
  id: string;
  chunkId: string;
  reason: string | null;
  documentName: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

interface EvaluationData {
  status: string;
  summary: string | null;
  confidence: number | null;
  evidences: EvidenceData[];
}

interface RequirementEvaluationCardProps {
  evaluation: EvaluationData;
  caseId: string;
}

export function RequirementEvaluationCard({ evaluation, caseId }: RequirementEvaluationCardProps) {
  // Map internal status to human-readable text
  let statusText = "Not evaluated yet";
  let statusColor: "default" | "success" | "warning" | "error" | "outline" = "default";

  if (evaluation.status === "PENDING" || evaluation.status === "NOT_RUN") {
    statusText = "Not evaluated yet";
    statusColor = "default";
  } else if (evaluation.status === "PROCESSING") {
    statusText = "Analyzing documents...";
    statusColor = "warning";
  } else if (evaluation.status === "SATISFIED" || evaluation.status === "NOT_SATISFIED") {
    statusText = "Analysis complete";
    statusColor = evaluation.status === "SATISFIED" ? "success" : "error";
  } else if (evaluation.status === "INSUFFICIENT_EVIDENCE") {
    statusText = "Not enough evidence";
    statusColor = "warning";
  } else if (evaluation.status === "FAILED") {
    statusText = "Analysis failed";
    statusColor = "error";
  }

  // Format confidence
  let confidenceText = null;
  if (evaluation.confidence !== null) {
    const pct = Math.round(evaluation.confidence * 100);
    if (pct >= 80) confidenceText = `High confidence (${pct}%)`;
    else if (pct >= 50) confidenceText = `Medium confidence (${pct}%)`;
    else confidenceText = `Low confidence (${pct}%)`;
  }

  return (
    <div className="mt-4 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
      <div className="flex items-center gap-3 mb-3">
        <h4 className="text-sm font-semibold text-slate-800">AI Analysis</h4>
        <Badge variant={statusColor} className="text-[11px] px-2 py-0.5">
          {statusText}
        </Badge>
        {confidenceText && (
          <span className="text-xs text-slate-500 font-medium ml-auto">
            {confidenceText}
          </span>
        )}
      </div>

      {evaluation.summary && (
        <div className="mb-4 text-sm text-slate-600 leading-relaxed">
          {evaluation.summary}
          <div className="mt-2 text-xs text-slate-400 italic">
            * Assessment is based solely on available document evidence.
          </div>
        </div>
      )}

      {evaluation.status === "PROCESSING" && (
        <div className="mt-4 rounded-md border border-warning-200 bg-warning-50/50 p-4">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-warning-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-slate-700">Analyzing your documents</p>
              <p className="text-xs text-slate-500 mt-0.5">This usually takes a few seconds. The result will appear here automatically.</p>
            </div>
          </div>
        </div>
      )}

      {evaluation.status !== "PENDING" && evaluation.status !== "PROCESSING" && (
        evaluation.evidences.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-white p-4 text-center">
            <svg
              className="mx-auto h-6 w-6 text-slate-400 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-700 mb-1">
              No specific evidence was found
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adding more relevant documents to your case so the analysis can find supporting text for this requirement.
            </p>
          </div>
        ) : (
          <EvidencePanel evidences={evaluation.evidences} caseId={caseId} />
        )
      )}
    </div>
  );
}
