/**
 * Phase 13 — persistent ProcessingJob queue.
 *
 * The existing in-process queue (`processing-queue.ts`) remains the
 * executor — it provides bounded concurrency, in-memory throttling,
 * and SIGTERM/SIGINT drain. The Prisma-backed `ProcessingJob` table
 * is the durable record of every processing request. The two work
 * together:
 *
 *   1. `enqueueDocumentProcessing` (the existing function) is called
 *      from the upload action. We *additionally* write a row to the
 *      ProcessingJob table so the request survives a process restart.
 *
 *   2. The worker (also the existing in-process queue) reads the
 *      ProcessingJob row, claims a lock (status=RUNNING, lockedBy,
 *      lockedAt), and runs the existing `processDocument`. On
 *      success the row goes to COMPLETED; on failure to FAILED (or
 *      back to SCHEDULED for retry).
 *
 *   3. On startup, `recoverStaleJobs` resets RUNNING rows whose
 *      lockedAt is older than `PROCESSING_LOCK_TIMEOUT_MS` back to
 *      SCHEDULED. The next worker pickup picks them up.
 *
 *   4. If the in-process queue is shut down (SIGTERM/SIGINT), the
 *      ProcessingJob row stays in RUNNING. After restart the
 *      stale-recovery pass picks it up.
 *
 * Why not replace the in-process queue?
 *   - The brief forbids Redis / BullMQ / another DB. The in-process
 *     queue is the only executable path we have.
 *   - The in-process queue is fast (no DB round-trip per status flip).
 *   - The table is the source of truth for "is this job still alive?"
 *
 * The SQLite journal_mode is currently `delete` (not `wal`). Two
 * concurrent workers could race on the same row's lock. The locking
 * is `compareAndSwap`-style: the worker uses `updateMany` with a
 * `where: { status: 'SCHEDULED' }` predicate and reads back the
 * `count` to know whether it won. This is safe across both modes.
 */
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { recordAuditEvent } from "@/lib/audit/log";

/** How long a job can stay in RUNNING before it is considered stale. */
const PROCESSING_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Stable status values. Persisted as strings (not Prisma enums) to
 * keep the migration portable. Document every transition in the
 * "Job state machine" section of PHASE13-FINAL-REPORT.md.
 */
export const JOB_STATUS = {
  SCHEDULED: "SCHEDULED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/**
 * Stable worker identity. For the single-instance dev target this is
 * the literal string "inproc". A multi-process deploy would use a
 * hostname + pid, but multi-process is explicitly out of scope.
 */
const WORKER_ID = "inproc";

/**
 * Create a ProcessingJob row when a document is enqueued. Called by
 * the existing in-process enqueueDocumentProcessing. Returns the new
 * job id. Idempotent at the document level: a re-enqueue creates
 * another row, which is the same behavior as the in-process queue
 * (a re-enqueue also creates a new job there).
 */
export async function createProcessingJob(
  documentId: string
): Promise<{ jobId: string }> {
  // Look up the parent case so we can record the tradeCaseId on the
  // job (for the admin / recovery view). We do NOT require ownership
  // here — the caller (an action or a server-side function) has
  // already done the auth check.
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, tradeCaseId: true },
  });
  if (!doc) {
    log.warn("persistent-queue", "createProcessingJob: document not found", { documentId });
    return { jobId: "" };
  }
  const job = await prisma.processingJob.create({
    data: {
      documentId: doc.id,
      tradeCaseId: doc.tradeCaseId,
      status: JOB_STATUS.SCHEDULED,
      attempts: 0,
      scheduledFor: new Date(),
    },
    select: { id: true },
  });
  log.info("persistent-queue", "created ProcessingJob", { jobId: job.id, documentId });
  return { jobId: job.id };
}

/**
 * Try to claim a job for execution. Returns the claimed job, or null
 * if another worker already claimed it (or the job is no longer in
 * SCHEDULED state).
 *
 * The `updateMany` returns `count` which we use to detect whether
 * this worker won the race. This is safe under both `journal_mode=delete`
 * and `journal_mode=wal`.
 */
export async function claimJob(jobId: string): Promise<{
  jobId: string;
  documentId: string;
  tradeCaseId: string | null;
  attempts: number;
} | null> {
  const now = new Date();
  const out = await prisma.processingJob.updateMany({
    where: { id: jobId, status: JOB_STATUS.SCHEDULED },
    data: {
      status: JOB_STATUS.RUNNING,
      lockedBy: WORKER_ID,
      lockedAt: now,
      startedAt: now,
      attempts: { increment: 1 },
    },
  });
  if (out.count === 0) {
    return null; // someone else won (or the job is gone)
  }
  const job = await prisma.processingJob.findUnique({
    where: { id: jobId },
    select: { id: true, documentId: true, tradeCaseId: true, attempts: true },
  });
  if (!job) return null;
  return {
    jobId: job.id,
    documentId: job.documentId ?? "",
    tradeCaseId: job.tradeCaseId,
    attempts: job.attempts,
  };
}

/**
 * Mark a job as completed. Idempotent: if the job is already in a
 * terminal state, the update is a no-op.
 */
export async function completeJob(jobId: string): Promise<void> {
  await prisma.processingJob.updateMany({
    where: { id: jobId, status: JOB_STATUS.RUNNING },
    data: {
      status: JOB_STATUS.COMPLETED,
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: null,
    },
  });
}

/**
 * Mark a job as failed with a truncated error message. The job
 * stays in the FAILED state — re-enqueue creates a new row.
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const truncated = error.length > 500 ? error.slice(0, 500) : error;
  await prisma.processingJob.updateMany({
    where: { id: jobId, status: JOB_STATUS.RUNNING },
    data: {
      status: JOB_STATUS.FAILED,
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: truncated,
    },
  });
}

/**
 * Mark a job as CANCELLED. Called when the document (or its parent
 * case) is soft-deleted between enqueue and worker pickup. The job
 * is treated as a successful no-op (no error), so the queue can move
 * on.
 */
export async function cancelJob(
  jobId: string,
  reason: string
): Promise<void> {
  const truncated = reason.length > 500 ? reason.slice(0, 500) : reason;
  await prisma.processingJob.updateMany({
    where: { id: jobId, status: { in: [JOB_STATUS.SCHEDULED, JOB_STATUS.RUNNING] } },
    data: {
      status: JOB_STATUS.CANCELLED,
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: truncated,
    },
  });
}

/**
 * On startup, reset RUNNING rows whose `lockedAt` is older than
 * `PROCESSING_LOCK_TIMEOUT_MS` back to SCHEDULED. The next worker
 * pickup claims them. The number of recovered rows is logged and
 * optionally audit-logged.
 *
 * This is a one-shot function. The verify-phase13 script calls it
 * directly to test the behavior. The dev server does NOT auto-call
 * it on module load (the in-process queue is short-lived and HMR
 * resets it frequently; the row reset is a one-time concern). The
 * production deploy path can call it from a startup hook if needed.
 */
export async function recoverStaleJobs(): Promise<{
  recovered: number;
}> {
  const cutoff = new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS);
  const out = await prisma.processingJob.updateMany({
    where: {
      status: JOB_STATUS.RUNNING,
      lockedAt: { lt: cutoff },
    },
    data: {
      status: JOB_STATUS.SCHEDULED,
      lockedBy: null,
      lockedAt: null,
    },
  });
  if (out.count > 0) {
    log.warn("persistent-queue", "recovered stale jobs", {
      recovered: out.count,
      cutoffIso: cutoff.toISOString(),
    });
    // Audit each recovered job. userId is null (system-initiated).
    try {
      await recordAuditEvent({
        userId: null,
        action: "STALE_JOB_RECOVERED",
        target: "ProcessingJob",
        targetId: null,
        metadata: { count: out.count, cutoffIso: cutoff.toISOString() },
      });
    } catch (e) {
      // recordAuditEvent is best-effort; we already logged.
    }
  }
  return { recovered: out.count };
}

/**
 * Count jobs by status. Used by the verify-phase13 script and any
 * future admin view. Cheap (a single indexed count per status).
 */
export async function getJobStats(): Promise<{
  scheduled: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}> {
  const groups = await prisma.processingJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out = {
    scheduled: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  };
  for (const g of groups) {
    const count = g._count._all;
    out.total += count;
    if (g.status === JOB_STATUS.SCHEDULED) out.scheduled = count;
    else if (g.status === JOB_STATUS.RUNNING) out.running = count;
    else if (g.status === JOB_STATUS.COMPLETED) out.completed = count;
    else if (g.status === JOB_STATUS.FAILED) out.failed = count;
    else if (g.status === JOB_STATUS.CANCELLED) out.cancelled = count;
  }
  return out;
}
