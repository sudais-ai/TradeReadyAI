import { z } from "zod";

/**
 * Phase 6 — ID validators.
 *
 * Prisma's `@default(uuid())` means every primary key is a UUID. We never
 * trust a client-supplied id at face value; this module exposes one Zod
 * schema per id type so future actions / API routes can validate uniformly
 * before any database query runs.
 */
const uuid = z.string().uuid("Invalid id");

export const userIdSchema = uuid;
export const tradeCaseIdSchema = uuid;
export const documentIdSchema = uuid;
export const requirementIdSchema = uuid;
export const evaluationIdSchema = uuid;
export const evidenceIdSchema = uuid;
export const chunkIdSchema = uuid;
