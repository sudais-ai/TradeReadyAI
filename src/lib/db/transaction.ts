import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Phase 6 — transaction helper.
 *
 * Wraps Prisma's `$transaction` so call sites can opt in to atomicity
 * without importing the Prisma client directly. The single shared
 * `prisma` instance is reused; no new connection is opened.
 *
 * Phase 6 does not retro-fit any production action — call sites adopt
 * this helper incrementally when they have a real multi-write invariant
 * to protect.
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn);
}
