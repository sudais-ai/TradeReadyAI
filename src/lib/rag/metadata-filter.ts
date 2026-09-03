/**
 * Phase 11 — Metadata Filtering.
 *
 * Purpose: provide a single, composable filter object that both the vector
 * and keyword retrievers can apply. The tradeCaseId filter remains the
 * security boundary and is ALWAYS applied first. Optional filters are
 * convenience filters for the caller.
 *
 * What this layer does:
 *  - Validates that `tradeCaseId` is present (throws otherwise).
 *  - Normalizes the optional filters (documentId, processingStatus, processedAt bounds).
 *  - Exposes a typed `MetadataFilter` that can be passed to `searchSimilarChunks`
 *    and to the FTS5 keyword retriever.
 *
 * What this layer does NOT do:
 *  - It does NOT replace the `tradeCaseId` enforcement inside the underlying
 *    queries. That is the security boundary, and it lives in the SQL itself.
 *    This filter is additive on top.
 */

export interface MetadataFilter {
  /** MANDATORY — security boundary. */
  tradeCaseId: string;
  /** Optional: only chunks from this document. */
  documentId?: string;
  /** Optional: only chunks whose parent document has this processing status. */
  processingStatus?: string;
  /** Optional: only documents processed at/after this time. */
  minProcessedAt?: Date;
  /** Optional: only documents processed at/before this time. */
  maxProcessedAt?: Date;
}

/**
 * Build a Prisma `where` filter for `prisma.documentChunkEmbedding.findMany` or
 * `prisma.documentChunk.findMany`. The `tradeCaseId` filter is MANDATORY; the
 * rest are optional and AND-ed.
 */
export function buildChunkWhere(
  filter: MetadataFilter
): {
  document: {
    tradeCaseId: string;
    id?: string;
    processingStatus?: string;
    processedAt?: { gte?: Date; lte?: Date };
  };
} {
  if (!filter.tradeCaseId) {
    throw new Error("MetadataFilter.tradeCaseId is required.");
  }
  const docWhere: {
    tradeCaseId: string;
    id?: string;
    processingStatus?: string;
    processedAt?: { gte?: Date; lte?: Date };
  } = { tradeCaseId: filter.tradeCaseId };
  if (filter.documentId) docWhere.id = filter.documentId;
  if (filter.processingStatus) docWhere.processingStatus = filter.processingStatus;
  if (filter.minProcessedAt || filter.maxProcessedAt) {
    docWhere.processedAt = {};
    if (filter.minProcessedAt) docWhere.processedAt.gte = filter.minProcessedAt;
    if (filter.maxProcessedAt) docWhere.processedAt.lte = filter.maxProcessedAt;
  }
  return { document: docWhere };
}

/**
 * Validate a metadata filter and return it as a fully-typed
 * `MetadataFilter` with the tradeCaseId guaranteed to be a non-empty
 * string. Throws if any required field is missing or malformed.
 *
 * Returning the validated object (rather than using `asserts ... is ...`)
 * avoids TypeScript's "still optional after assertion" issue with
 * `Partial<T>` destructuring at the call site.
 */
export function validateMetadataFilter(
  filter: Partial<MetadataFilter>
): MetadataFilter {
  if (!filter.tradeCaseId || typeof filter.tradeCaseId !== "string") {
    throw new Error("tradeCaseId is required and must be a non-empty string.");
  }
  if (filter.documentId !== undefined && typeof filter.documentId !== "string") {
    throw new Error("documentId, if provided, must be a string.");
  }
  if (
    filter.processingStatus !== undefined &&
    typeof filter.processingStatus !== "string"
  ) {
    throw new Error("processingStatus, if provided, must be a string.");
  }
  if (
    filter.minProcessedAt !== undefined &&
    !(filter.minProcessedAt instanceof Date)
  ) {
    throw new Error("minProcessedAt, if provided, must be a Date.");
  }
  if (
    filter.maxProcessedAt !== undefined &&
    !(filter.maxProcessedAt instanceof Date)
  ) {
    throw new Error("maxProcessedAt, if provided, must be a Date.");
  }
  if (
    filter.minProcessedAt &&
    filter.maxProcessedAt &&
    filter.minProcessedAt > filter.maxProcessedAt
  ) {
    throw new Error("minProcessedAt must be <= maxProcessedAt.");
  }
  return {
    tradeCaseId: filter.tradeCaseId,
    documentId: filter.documentId,
    processingStatus: filter.processingStatus,
    minProcessedAt: filter.minProcessedAt,
    maxProcessedAt: filter.maxProcessedAt,
  };
}

/**
 * Back-compat alias for the old assertion-style helper.
 */
export const assertMetadataFilter = validateMetadataFilter;
