"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { createRequirement, updateRequirement, deleteRequirement } from "@/actions/requirements";
import { triggerRequirementEvaluation } from "@/actions/evaluations";
import { RequirementEvaluationCard } from "@/components/ui/RequirementEvaluationCard";
import { useRouter, useSearchParams } from "next/navigation";

interface Requirement {
  id: string;
  title: string;
  status: string;
  source?: string | null;
  evaluation?: {
    status: string;
    summary: string | null;
    confidence: number | null;
    evidences: Array<{
      id: string;
      chunkId: string;
      reason: string | null;
      chunk: {
        document: {
          id: string;
          name: string;
        };
        chunkIndex: number;
        content: string;
      };
    }>;
  } | null;
}

interface RequirementsManagerProps {
  tradeCaseId: string;
  initialRequirements: Requirement[];
}

function getReqBadgeVariant(status: string) {
  switch (status) {
    case "Confirmed": return "success";
    case "Needs review": return "warning";
    case "May be required": return "default";
    default: return "default";
  }
}

export function RequirementsManager({ tradeCaseId, initialRequirements }: RequirementsManagerProps) {
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterDocumentId = searchParams.get("documentId");

  // When a `?documentId=…` query is present, only show requirements whose evaluation
  // evidences reference the corresponding document.
  const filteredRequirements = useMemo(() => {
    if (!filterDocumentId) return requirements;
    return requirements.filter((r) =>
      r.evaluation?.evidences?.some((e) => e.chunk.document.id === filterDocumentId)
    );
  }, [requirements, filterDocumentId]);

  const clearFilter = () => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("documentId");
    const qs = params.toString();
    router.replace(qs ? `/cases/${tradeCaseId}/requirements?${qs}` : `/cases/${tradeCaseId}/requirements`);
  };

  // Form State
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("Needs review");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action-level errors (toast-style banners that don't block the form)
  const [actionError, setActionError] = useState<string | null>(null);

  // Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setSource("");
    setStatus("Needs review");
    setError(null);
    setIsAdding(false);
    setEditingId(null);
  }

  function startEdit(req: Requirement) {
    setTitle(req.title);
    setSource(req.source || "");
    setStatus(req.status);
    setEditingId(req.id);
    setIsAdding(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (editingId) {
        const result = await updateRequirement(tradeCaseId, editingId, { title, source, status });
        if (result.success) {
          setRequirements((prev) =>
            prev.map((r) => (r.id === editingId ? { ...r, title, source, status } : r))
          );
          resetForm();
        } else {
          setError(result.error || "Failed to update requirement.");
        }
      } else {
        const result = await createRequirement(tradeCaseId, { title, source, status });
        if (result.success && result.id) {
          setRequirements((prev) => [
            ...prev,
            { id: result.id, title, source, status },
          ]);
          resetForm();
        } else {
          setError(result.error || "Failed to add requirement.");
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    setDeletingId(id);
    try {
      const result = await deleteRequirement(tradeCaseId, id);
      if (result.success) {
        setRequirements((prev) => prev.filter((r) => r.id !== id));
        setDeletingId(null);
      } else {
        setActionError(result.error || "Failed to delete requirement.");
        setDeletingId(null);
      }
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
      setDeletingId(null);
    }
  }

  async function handleEvaluate(id: string) {
    setActionError(null);
    setEvaluatingId(id);
    try {
      const result = await triggerRequirementEvaluation(tradeCaseId, id);
      if (!result.success) {
        setActionError(result.error || "Failed to evaluate requirement.");
      } else {
        router.refresh();
      }
    } catch {
      setActionError("We couldn't complete the analysis right now. Please try again.");
    } finally {
      setEvaluatingId(null);
    }
  }

  const confirmedCount = requirements.filter((r) => r.status === "Confirmed").length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <p className="text-sm text-slate-500">
          {filteredRequirements.length === 0 ? "No requirements added yet." : (
            <>
              {filteredRequirements.length} {filteredRequirements.length === 1 ? "requirement" : "requirements"} identified
              {confirmedCount > 0 && <> · {confirmedCount} confirmed</>}
            </>
          )}
        </p>
        {!isAdding && !editingId && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            + Add Requirement
          </Button>
        )}
      </div>

      {filterDocumentId && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1h-1l-2 9H6l-2-9H4a1 1 0 01-1-1V4z" />
          </svg>
          <span className="flex-1">
            Showing requirements that reference this document.
            {filteredRequirements.length === 0 && " (none match)"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilter}
            className="h-7 px-2 text-xs text-primary-700 hover:bg-primary-100"
          >
            Clear filter
          </Button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-error-700 hover:text-error-900 text-xs font-medium"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {requirements.length === 0 && !isAdding && !editingId && (
        <div className="text-center py-12 px-4 rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <svg className="mx-auto h-12 w-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-sm font-medium text-slate-900 mb-1">No requirements added yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
            Add trade requirements to keep track of permits, certificates, and other compliance needs for this case.
          </p>
          <Button onClick={() => setIsAdding(true)} variant="outline">
            Add Requirement
          </Button>
        </div>
      )}

      {(isAdding || editingId) && (
        <div className="mb-8 p-5 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editingId ? "Edit Requirement" : "Add New Requirement"}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="req-title" className="block text-sm font-medium text-slate-700 mb-1">
                Requirement title <span className="text-error-500">*</span>
              </label>
              <Input
                id="req-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Import permit, Phytosanitary certificate"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="req-source" className="block text-sm font-medium text-slate-700 mb-1">
                  Source
                </label>
                <Input
                  id="req-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g., Customs Authority"
                />
              </div>

              <div>
                <label htmlFor="req-status" className="block text-sm font-medium text-slate-700 mb-1">
                  Status
                </label>
                <Select
                  id="req-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="Needs review">Needs review</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="May be required">May be required</option>
                </Select>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-error-50 text-error-700 text-sm rounded-md" role="alert">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Requirement"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {filteredRequirements.length === 0 && filterDocumentId && requirements.length > 0 && (
          <div className="text-center py-10 px-4 rounded-lg border border-dashed border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600 mb-2">
              No requirements currently reference this document.
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilter}>
              Show all requirements
            </Button>
          </div>
        )}
        {filteredRequirements.map((req) => (
          <div
            key={req.id}
            className="flex flex-col p-5 rounded-lg border border-border bg-surface"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 mt-0.5" aria-hidden="true">
                {req.status === "Confirmed" ? (
                  <svg className="w-4 h-4 text-success-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h3 className="font-medium text-slate-900 text-sm">{req.title}</h3>
                  <Badge variant={getReqBadgeVariant(req.status) as "default" | "success" | "warning" | "error" | "outline"}>
                    {req.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  {req.source ? `Source: ${req.source}` : "Source not provided"}
                </p>
              </div>
            </div>

            {req.evaluation && (
              <RequirementEvaluationCard
                caseId={tradeCaseId}
                evaluation={{
                  status: req.evaluation.status,
                  summary: req.evaluation.summary,
                  confidence: req.evaluation.confidence,
                  evidences: req.evaluation.evidences.map(e => ({
                    id: e.id,
                    chunkId: e.chunkId,
                    reason: e.reason,
                    documentName: e.chunk.document.name,
                    documentId: e.chunk.document.id,
                    chunkIndex: e.chunk.chunkIndex,
                    content: e.chunk.content
                  }))
                }}
              />
            )}
            
            <div className="flex items-center gap-2 mt-4 sm:mt-4 pt-4 border-t border-slate-100">
              {deletingId === req.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-error-600 font-medium">Delete this?</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    onClick={() => setDeletingId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-error-600 border-error-200 hover:bg-error-50"
                    onClick={() => handleDelete(req.id)}
                  >
                    Confirm
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEvaluate(req.id)}
                    disabled={isAdding || editingId !== null || deletingId !== null || evaluatingId !== null}
                    className="h-8 text-primary-600 hover:text-primary-700 hover:bg-primary-50"
                  >
                    {evaluatingId === req.id ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing...
                      </span>
                    ) : req.evaluation && req.evaluation.status !== "PENDING" ? (
                      "Re-analyze"
                    ) : (
                      "Analyze with AI"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(req)}
                    disabled={isAdding || editingId !== null || deletingId !== null || evaluatingId !== null}
                    className="h-8"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(req.id)}
                    disabled={isAdding || editingId !== null || deletingId !== null || evaluatingId !== null}
                    className="h-8 text-error-600 hover:text-error-700 hover:bg-error-50"
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
