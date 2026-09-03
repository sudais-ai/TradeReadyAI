"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

interface DocumentDropzoneProps {
  file: File | null;
  onFileChange: (file: File | null, error?: string) => void;
}

/**
 * Validate a dropped / selected file. Returns an error message
 * or null if the file is acceptable. Server-side validation remains authoritative.
 */
function validateFile(file: File): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_SIZE) {
    return "This file is too large. Please choose a file smaller than 10 MB.";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return "This file type isn't supported. Please upload a PDF, Word, Excel, CSV, PNG, or JPG file.";
  }
  return null;
}

export function DocumentDropzone({ file, onFileChange }: DocumentDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) {
        setError(err);
        onFileChange(null, err);
        return;
      }
      setError(null);
      onFileChange(f);
    },
    [onFileChange]
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center min-h-[120px] px-4 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          isDragging
            ? "border-primary-500 bg-primary-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100",
          error && "border-error-300 bg-error-50"
        )}
        aria-label="Drop a file here or click to browse"
      >
        <svg
          className={cn(
            "h-8 w-8 mb-2",
            error ? "text-error-500" : isDragging ? "text-primary-600" : "text-slate-400"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.9-1A5.5 5.5 0 0118 16h-1m-6-4l-3 3m0 0l3 3m-3-3h12"
          />
        </svg>
        <p className={cn("text-sm font-medium", error ? "text-error-700" : "text-slate-700")}>
          {isDragging ? "Drop the file here" : "Drop a file or click to browse"}
        </p>
        <p className="text-xs text-slate-500 mt-1 text-center">
          PDF, Word, Excel, CSV, PNG, or JPG · up to 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset value so the same file can be re-selected after a change.
            e.target.value = "";
          }}
        />
      </div>
      {file && (
        <div className="flex items-center gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate flex-1">{file.name}</span>
          <button
            type="button"
            className="text-xs font-medium text-success-800 hover:text-success-900 hover:underline shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onFileChange(null);
              setError(null);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-error-600" role="alert">{error}</p>
      )}
    </div>
  );
}

// Re-export the accepted types so the upload form can show them.
export const DOCUMENT_DROPZONE_ACCEPT = ACCEPTED_EXTENSIONS;
