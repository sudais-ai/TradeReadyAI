"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ProcessingStatusIndicator } from "@/components/documents/ProcessingStatusIndicator";
import { DocumentDropzone } from "@/components/documents/DocumentDropzone";
import { uploadDocument, updateDocument, deleteDocument } from "@/actions/documents";
import { retryDocumentProcessing, retryEmbeddingProcessing } from "@/actions/processing";
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from "@/lib/validations/document";

interface Document {
  id: string;
  name: string;
  type?: string;
  status: string;
  description?: string | null;
  size?: number | null;
  fileRef?: string | null;
  processingStatus?: string | null;
  embeddingStatus?: string | null;
  chunkCount?: number | null;
  evidenceCount?: number;
  uploadedAt?: string;
}

interface DocumentsManagerProps {
  tradeCaseId: string;
  initialDocuments: Document[];
}

function getStatusBadgeVariant(status: string): "default" | "success" | "warning" | "error" | "outline" {
  switch (status) {
    case "Added": return "success";
    case "Pending": return "warning";
    case "Reviewed": return "outline";
    default: return "default";
  }
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ─── Add Document Form ────────────────────────────────────────────────────────

function AddDocumentForm({
  tradeCaseId,
  onAdded,
}: {
  tradeCaseId: string;
  onAdded: (doc: Document) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState("");
  const [name, setName] = React.useState("");

  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!type) errs.type = "Document type is required.";
    if (!file) errs.file = "Please select a file to upload.";
    return errs;
  };

  const handleFileChange = (selectedFile: File | null, validationError?: string) => {
    if (validationError) {
      setFile(null);
      return;
    }
    setFile(selectedFile);
    if (selectedFile) {
      if (!name) setName(selectedFile.name);
      if (formErrors.file) {
        setFormErrors((prev) => {
          const n = { ...prev };
          delete n.file;
          return n;
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    if (!file) return;

    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("name", name || file.name);

      const result = await uploadDocument(tradeCaseId, formData);
      if (result.success && result.id) {
        onAdded({
          id: result.id,
          name: name || file.name,
          type,
          status: "Added",
          size: file.size,
          fileRef: "uploaded",
          processingStatus: "READY", // optimistic — page refresh will get real status
        });
        setFile(null);
        setType("");
        setName("");
        setIsOpen(false);
      } else {
        setError(result.error || "Failed to upload document.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm">
        + Upload Document
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50 p-4">
      <h3 className="font-semibold text-slate-900 text-sm mb-4">Upload a document</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div className="space-y-2">
            <Label htmlFor="add-doc-type">
              Document type <span className="text-error-500" aria-hidden="true">*</span>
            </Label>
            <Select
              id="add-doc-type"
              name="type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (formErrors.type) {
                  setFormErrors((prev) => {
                    const n = { ...prev };
                    delete n.type;
                    return n;
                  });
                }
              }}
              aria-invalid={!!formErrors.type}
              aria-describedby={formErrors.type ? "add-doc-type-error" : undefined}
              error={!!formErrors.type}
            >
              <option value="">Choose a type…</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            {formErrors.type && (
              <p id="add-doc-type-error" className="text-sm text-error-600" role="alert">
                {formErrors.type}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              File <span className="text-error-500" aria-hidden="true">*</span>
            </Label>
            <DocumentDropzone file={file} onFileChange={handleFileChange} />
            {formErrors.file && (
              <p id="add-doc-file-error" className="text-sm text-error-600" role="alert">
                {formErrors.file}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-doc-name">Document name (Optional)</Label>
            <Input
              id="add-doc-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Will default to file name if left blank"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-error-600 mb-3" role="alert">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              setFile(null);
              setType("");
              setName("");
              setFormErrors({});
              setError(null);
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isLoading}>
            {isLoading ? "Uploading…" : "Upload Document"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({
  tradeCaseId,
  doc,
  onUpdated,
  onDeleted,
}: {
  tradeCaseId: string;
  doc: Document;
  onUpdated: (updated: Document) => void;
  onDeleted: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [editData, setEditData] = React.useState({
    name: doc.name,
    type: doc.type ?? "",
    status: doc.status as typeof DOCUMENT_STATUSES[number],
    description: doc.description ?? "",
  });

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateDocument(tradeCaseId, doc.id, editData);
      if (result.success) {
        onUpdated({ ...doc, ...editData });
        setIsEditing(false);
      } else {
        setError(result.error || "Failed to update document.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteDocument(tradeCaseId, doc.id);
      if (result.success) {
        onDeleted(doc.id);
      } else {
        setError(result.error || "Failed to remove document.");
        setIsConfirmingDelete(false);
      }
    } catch {
      setError("An unexpected error occurred.");
      setIsConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setError(null);
    try {
      let result;
      if (doc.processingStatus === "READY" && doc.embeddingStatus === "FAILED") {
        result = await retryEmbeddingProcessing(tradeCaseId, doc.id);
        if (result.success) {
          onUpdated({ ...doc, embeddingStatus: "READY" });
        }
      } else {
        result = await retryDocumentProcessing(tradeCaseId, doc.id);
        if (result.success) {
          onUpdated({ ...doc, processingStatus: "READY" });
        }
      }
      
      if (!result.success) {
        setError(result.error || "Could not retry processing.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsRetrying(false);
    }
  };

  if (isEditing) {
    return (
      <div className="p-4 rounded-lg border border-slate-300 bg-slate-50 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${doc.id}`}>Document name</Label>
            <Input
              id={`edit-name-${doc.id}`}
              name="name"
              value={editData.name}
              onChange={handleEditChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-type-${doc.id}`}>Document type</Label>
            <Select
              id={`edit-type-${doc.id}`}
              name="type"
              value={editData.type}
              onChange={handleEditChange}
            >
              <option value="">Choose a type…</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-status-${doc.id}`}>Status</Label>
          <Select
            id={`edit-status-${doc.id}`}
            name="status"
            value={editData.status}
            onChange={handleEditChange}
          >
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-error-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEditing(false);
              setError(null);
              setEditData({
                name: doc.name,
                type: doc.type ?? "",
                status: doc.status as typeof DOCUMENT_STATUSES[number],
                description: doc.description ?? "",
              });
            }}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} isLoading={isSaving}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    );
  }

  if (isConfirmingDelete) {
    return (
      <div className="p-4 rounded-lg border border-error-200 bg-error-50 space-y-3">
        <p className="font-medium text-slate-900 text-sm">Remove this document?</p>
        <p className="text-sm text-slate-600">
          This will permanently delete the document record and the uploaded file.
        </p>
        {error && <p className="text-sm text-error-600" role="alert">{error}</p>}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsConfirmingDelete(false);
              setError(null);
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
          >
            {isDeleting ? "Removing…" : "Remove Document"}
          </Button>
        </div>
      </div>
    );
  }

  const isAdded = doc.status === "Added" || doc.status === "Reviewed";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 mt-0.5"
          aria-hidden="true"
        >
          {isAdded ? (
            <svg className="w-4 h-4 text-success-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3
              className="font-medium text-slate-900 text-sm truncate max-w-full"
              title={doc.name}
            >
              {doc.name}
            </h3>
            <Badge variant={getStatusBadgeVariant(doc.status)}>{doc.status}</Badge>
            {typeof doc.evidenceCount === "number" && doc.evidenceCount > 0 && (
              <Link
                href={`/cases/${tradeCaseId}/requirements?documentId=${doc.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                title="View requirements that reference this document"
              >
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                </svg>
                {doc.evidenceCount} {doc.evidenceCount === 1 ? "evidence" : "evidence items"}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
            {doc.type && <span>{doc.type}</span>}
            {doc.type && doc.size && <span>•</span>}
            {doc.size && <span>{formatBytes(doc.size)}</span>}
          </div>
          {doc.description && (
            <p className="text-xs text-slate-400 mt-1">{doc.description}</p>
          )}
          {doc.processingStatus && (
            <div className="mt-1.5 flex items-center gap-2">
              <ProcessingStatusIndicator
                processingStatus={doc.processingStatus}
                embeddingStatus={doc.embeddingStatus}
                chunkCount={doc.chunkCount}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0 flex-wrap">
        {/* Retry button for failed processing or failed embedding */}
        {(doc.processingStatus === "FAILED" || doc.embeddingStatus === "FAILED") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            isLoading={isRetrying}
            className="text-error-600 border-error-200 hover:bg-error-50"
          >
            {isRetrying ? "Retrying…" : "Try Again"}
          </Button>
        )}
        {/* View file button — opens the in-app detail page */}
        <Link href={`/cases/${tradeCaseId}/documents/${doc.id}`}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-white"
          >
            View
          </Button>
        </Link>
        {/* Inspect extracted text — dev/debug */}
        {doc.processingStatus === "READY" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              window.open(
                `/cases/${tradeCaseId}/documents/${doc.id}/text`,
                "_blank"
              )
            }
            title="Inspect extracted text"
          >
            Text
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsConfirmingDelete(true)}
          className="text-error-600 hover:text-error-700 hover:bg-error-50"
        >
          Remove
        </Button>
      </div>

      {error && (
        <p className="text-sm text-error-600 mt-1 w-full pl-11" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main Manager Component ────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "name";

function processingBucket(doc: Document): "ready" | "processing" | "failed" | "none" {
  if (doc.processingStatus === "FAILED") return "failed";
  if (doc.processingStatus === "PENDING" || doc.processingStatus === "PROCESSING") return "processing";
  if (doc.processingStatus === "READY") return "ready";
  if (doc.embeddingStatus === "PENDING" || doc.embeddingStatus === "PROCESSING") return "processing";
  if (doc.embeddingStatus === "FAILED") return "failed";
  return "none";
}

function DocumentsFilterBar({
  documents,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  sort,
  setSort,
  onReset,
}: {
  documents: Document[];
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  onReset: () => void;
}) {
  const uniqueTypes = React.useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => d.type && set.add(d.type));
    return Array.from(set).sort();
  }, [documents]);

  const isFiltered =
    typeFilter !== "All" ||
    statusFilter !== "All" ||
    search.trim() !== "" ||
    sort !== "newest";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <Input
            id="doc-search"
            name="doc-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename…"
            className="bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="doc-sort" className="text-xs font-medium text-slate-600 shrink-0">
            Sort
          </label>
          <Select
            id="doc-sort"
            name="doc-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A→Z)</option>
          </Select>
        </div>
      </div>

      {uniqueTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-600 mr-1">Type:</span>
          <FilterChip label="All" active={typeFilter === "All"} onClick={() => setTypeFilter("All")} />
          {uniqueTypes.map((t) => (
            <FilterChip
              key={t}
              label={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600 mr-1">Status:</span>
        {["All", "ready", "processing", "failed", "none"].map((s) => (
          <FilterChip
            key={s}
            label={
              s === "All" ? "All" :
              s === "ready" ? "Ready" :
              s === "processing" ? "Processing" :
              s === "failed" ? "Failed" : "Not processed"
            }
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs font-medium text-primary-700 hover:text-primary-800 hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors " +
        (active
          ? "bg-primary-600 border-primary-600 text-white"
          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300")
      }
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function DocumentsManager({ tradeCaseId, initialDocuments }: DocumentsManagerProps) {
  const router = useRouter();
  const [documents, setDocuments] = React.useState<Document[]>(initialDocuments);
  const [typeFilter, setTypeFilter] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");

  // Phase 16: while any document is still in PENDING/PROCESSING
  // (extraction or embedding), poll the server to pick up the
  // terminal state without forcing a manual refresh. We only
  // re-render the server component (no full page reload) and we
  // stop the moment no document is in flight. Capped at 5 minutes
  // of polling so a stuck worker doesn't burn a tab open forever.
  const anyInFlight = documents.some(
    (d) =>
      d.processingStatus === "PENDING" ||
      d.processingStatus === "PROCESSING" ||
      d.embeddingStatus === "PENDING" ||
      d.embeddingStatus === "PROCESSING"
  );
  React.useEffect(() => {
    if (!anyInFlight) return;
    const startedAt = Date.now();
    const MAX_POLL_MS = 5 * 60 * 1000;
    const id = window.setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        window.clearInterval(id);
        return;
      }
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [anyInFlight, router]);

  // Phase 16: after a router.refresh, the server-rendered prop carries
  // the latest processing/embedding state. Mirror it into local state so
  // the row indicators and filters update. We do this in an effect that
  // only fires when the upstream prop changes, so user-driven local
  // mutations (added/updated/deleted) are not stomped on.
  React.useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const handleAdded = (doc: Document) => {
    setDocuments((prev) => [...prev, doc]);
  };

  const handleUpdated = (updated: Document) => {
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleDeleted = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const addedCount = documents.filter(
    (d) => d.status === "Added" || d.status === "Reviewed"
  ).length;

  const filteredDocuments = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = documents;
    if (typeFilter !== "All") {
      list = list.filter((d) => d.type === typeFilter);
    }
    if (statusFilter !== "All") {
      list = list.filter((d) => processingBucket(d) === statusFilter);
    }
    if (q) {
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    list = list.slice();
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return sort === "newest" ? bt - at : at - bt;
    });
    return list;
  }, [documents, typeFilter, statusFilter, search, sort]);

  const resetFilters = () => {
    setTypeFilter("All");
    setStatusFilter("All");
    setSearch("");
    setSort("newest");
  };

  const showFilterBar = documents.length >= 3;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {documents.length === 0
              ? "No documents added yet."
              : `${addedCount} of ${documents.length} documents added`}
          </p>
        </div>
        <AddDocumentForm tradeCaseId={tradeCaseId} onAdded={handleAdded} />
      </div>

      {showFilterBar && (
        <DocumentsFilterBar
          documents={documents}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          sort={sort}
          setSort={setSort}
          onReset={resetFilters}
        />
      )}

      {documents.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-slate-200">
          <svg
            className="mx-auto h-10 w-10 text-slate-300 mb-4"
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
          <p className="font-medium text-slate-900 mb-1">No documents added yet</p>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Upload the documents associated with this trade case so your case can be prepared for review.
          </p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200">
          <p className="font-medium text-slate-900 mb-1">No documents match your filters</p>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-3">
            Try adjusting the search or clearing the filters.
          </p>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => (
            <DocumentRow
              key={doc.id}
              tradeCaseId={tradeCaseId}
              doc={doc}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
