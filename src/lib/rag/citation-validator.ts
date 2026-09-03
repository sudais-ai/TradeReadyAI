/**
 * Phase 11 — Citation Validator.
 *
 * A citation is `{ chunkId, reason }` (the AI's claimed evidence).
 * A valid citation must:
 *   1. Have a `chunkId` that is in the candidate set (i.e. the AI did
 *      not invent an ID that was never retrieved).
 *   2. Belong to a chunk in the requested `tradeCaseId`. (Defense in
 *      depth — the retrieval layer already filters, but the citation
 *      layer is the last line of defense.)
 *   3. (Optional) Belong to a `documentId` that the AI also claimed.
 *      If the AI claims a `documentId` that does not contain this
 *      chunk, the citation is invalid.
 *
 * If ANY of these checks fail, the citation is moved to the `invalid`
 * list. The caller decides what to do with the invalid citations:
 *  - For the evaluation path: drop them, downgrade to INSUFFICIENT_EVIDENCE
 *    if all citations are invalid (this is what the existing
 *    `evaluation-service.ts:57` does).
 *  - For a search/Q&A path: drop them silently.
 *
 * The function never throws on bad input — it filters and returns
 * `{ valid, invalid }`. This is the contract the rest of the pipeline
 * depends on.
 */

import { prisma } from "../db/prisma";

export interface Citation {
  chunkId: string;
  reason?: string;
  /** Optional: the AI's claim of which document the chunk came from. */
  documentId?: string;
}

export interface CitationValidation {
  valid: Citation[];
  invalid: Citation[];
  /** Citations that were valid by chunkId but failed the tradeCaseId check. */
  crossCase: Citation[];
}

export interface ValidateOptions {
  tradeCaseId: string; // MANDATORY
  /** If true, also verify that the chunk's documentId (if any) matches the citation. */
  verifyDocumentId?: boolean;
}

interface ChunkRow {
  id: string;
  documentId: string;
  document: { tradeCaseId: string };
}

/**
 * Validate a batch of citations against a set of valid chunkIds and the
 * requested trade case.
 *
 * Performance: a single Prisma query resolves all `chunkId`s at once. The
 * default `verifyDocumentId` is `false` because the retrieval layer
 * already enforces the right document, so the AI's `documentId` claim is
 * informational only.
 */
export async function validateCitations(
  citations: Citation[],
  validChunkIds: Set<string>,
  options: ValidateOptions
): Promise<CitationValidation> {
  if (citations.length === 0) {
    return { valid: [], invalid: [], crossCase: [] };
  }
  if (!options.tradeCaseId) {
    throw new Error("validateCitations: tradeCaseId is required.");
  }

  // First pass: drop citations whose chunkId isn't even in the candidate set.
  const inValidSet = citations.filter((c) => validChunkIds.has(c.chunkId));
  const inValidSetButNotChunk = citations.filter(
    (c) => !validChunkIds.has(c.chunkId)
  );

  if (inValidSet.length === 0) {
    return { valid: [], invalid: inValidSetButNotChunk, crossCase: [] };
  }

  // Second pass: load the actual chunk rows and verify tradeCaseId (+ optional documentId).
  const chunkRows = await prisma.documentChunk.findMany({
    where: { id: { in: inValidSet.map((c) => c.chunkId) } },
    select: {
      id: true,
      documentId: true,
      document: { select: { tradeCaseId: true } },
    },
  });

  const byId = new Map<string, ChunkRow>(chunkRows.map((r) => [r.id, r]));

  const valid: Citation[] = [];
  const crossCase: Citation[] = [];
  const invalid: Citation[] = [...inValidSetButNotChunk];

  for (const c of inValidSet) {
    const row = byId.get(c.chunkId);
    if (!row) {
      // ChunkId was in the candidate set but the chunk doesn't exist
      // (e.g. race condition where the chunk was deleted between
      // retrieval and validation). Treat as invalid.
      invalid.push(c);
      continue;
    }
    if (row.document.tradeCaseId !== options.tradeCaseId) {
      crossCase.push(c);
      invalid.push(c);
      continue;
    }
    if (
      options.verifyDocumentId &&
      c.documentId !== undefined &&
      c.documentId !== row.documentId
    ) {
      invalid.push(c);
      continue;
    }
    valid.push(c);
  }

  return { valid, invalid, crossCase };
}
