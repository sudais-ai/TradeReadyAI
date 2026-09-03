/**
 * In-process document processing queue.
 *
 * Phase 9: replaces the synchronous `await processDocument(doc.id)` in the
 * upload server action with an enqueue + worker pattern, so the upload
 * response returns immediately while text extraction, chunking, and
 * embedding run in the background.
 *
 * Design constraints:
 *   - In-process only. No Redis, no BullMQ, no external broker. The brief
 *     forbids "Redis solely for convenience" and "another database."
 *   - Bounded concurrency. Default 2 concurrent jobs. Configurable.
 *   - Per-job error isolation. A thrown job error does not crash the
 *     worker or stall the queue.
 *   - No persistence. On process restart, in-flight jobs are lost — the
 *     DB row remains in PROCESSING or PENDING. A subsequent request can
 *     re-enqueue by calling `enqueueDocumentProcessing(id)` again (this
 *     is idempotent for our purposes: it appends another job, but the
 *     work is the same).
 *   - Test-friendly. Exposes `getQueueStats()` and `waitForJob()` for
 *     the verify-phase9 script.
 *
 * The queue is module-level singleton state. HMR in dev will reset the
 * queue (acceptable: in-flight jobs are picked up by a subsequent
 * enqueue, or the user retries them).
 */
import { processDocument } from "./processing-service";
import { log } from "@/lib/log";
import {
  createProcessingJob,
  claimJob,
  completeJob,
  failJob,
  cancelJob,
  JOB_STATUS,
} from "./persistent-queue";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ProcessingJob {
  /** UUID for the job. Distinct from the documentId. */
  id: string;
  /** The document this job is for. */
  documentId: string;
  /** Persistent ProcessingJob id (Prisma row). Distinct from the in-memory id. */
  persistentJobId: string;
  /** When the job was enqueued. */
  enqueuedAt: number;
  /** When the worker started the job (null if still pending). */
  startedAt: number | null;
  /** When the job finished (null if still pending/running). */
  finishedAt: number | null;
  /** Job status. */
  status: JobStatus;
  /** Error message if status === 'failed'. */
  error: string | null;
}

const DEFAULT_CONCURRENCY = (() => {
  // Phase 12: read from env at module load. Mirrors the
  // EMBEDDING_CONFIG pattern (parseInt with inline default). Honors
  // positive-integer values; falls back to 2 on malformed input.
  const raw = process.env.PROCESSING_CONCURRENCY;
  if (raw === undefined || raw === "") return 2;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    log.warn("processing-queue", "PROCESSING_CONCURRENCY is malformed; using default 2", { raw });
    return 2;
  }
  return n;
})();

// Module-level state. HMR-safe enough: in dev, the module reloads, the
// Map is recreated, and in-flight jobs are abandoned (the DB row is
// still PROCESSING — a re-enqueue or a manual retry handles it).
const jobs = new Map<string, ProcessingJob>();
const pendingQueue: string[] = []; // jobIds waiting to run
let runningCount = 0;
let concurrency = DEFAULT_CONCURRENCY;
let drainResolvers: Array<() => void> = [];
let accepting = true; // Phase 12: when false, enqueueDocumentProcessing is a no-op (used by shutdownQueue)

/**
 * Phase 12: graceful shutdown.
 *
 * Flips `accepting = false` so new enqueues no-op, then waits for the
 * in-flight + pending jobs to finish (or for `timeoutMs` to elapse).
 *
 * Designed to be called from a SIGTERM/SIGINT handler. Does NOT call
 * `process.exit` itself — the handler does that after this resolves,
 * so the queue has a chance to write its final log line.
 */
export async function shutdownQueue(
  opts: { timeoutMs?: number } = {}
): Promise<{ drained: boolean; stillRunning: string[] }> {
  const { timeoutMs = 30_000 } = opts;
  accepting = false;
  log.info("processing-queue", "shutdown requested", { timeoutMs, pending: pendingQueue.length, running: runningCount });

  const drained = await waitForDrain(timeoutMs);
  const stillRunning = Array.from(jobs.values())
    .filter((j) => j.status === "running" || j.status === "pending")
    .map((j) => j.id);

  if (!drained) {
    log.warn("processing-queue", "shutdown timed out; jobs still running", {
      stillRunning,
      timeoutMs,
    });
  } else {
    log.info("processing-queue", "shutdown complete (drained)", {
      completed: Array.from(jobs.values()).filter((j) => j.status === "completed").length,
      failed: Array.from(jobs.values()).filter((j) => j.status === "failed").length,
    });
  }
  return { drained, stillRunning };
}

/**
 * Phase 12: install SIGTERM/SIGINT handlers that drain the queue
 * before exit. Idempotent (HMR-safe): a module-level flag guards
 * against double-registration.
 *
 * Escape hatch: set `PROCESSING_WORKER_SIGNALS=0` to disable (for
 * multi-process deploys where another supervisor owns lifecycle).
 */
function installSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  if (process.env.PROCESSING_WORKER_SIGNALS === "0") {
    log.info("processing-queue", "signal handlers NOT installed (PROCESSING_WORKER_SIGNALS=0)");
    return;
  }

  const handler = (sig: NodeJS.Signals) => {
    log.info("processing-queue", "received signal; draining", { signal: sig });
    void shutdownQueue().finally(() => {
      log.info("processing-queue", "exiting after drain");
      // Use a small delay so the log line flushes.
      setTimeout(() => process.exit(0), 50);
    });
  };

  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
  log.info("processing-queue", "signal handlers installed", {
    signals: ["SIGTERM", "SIGINT"],
    envEscape: "PROCESSING_WORKER_SIGNALS=0 to disable",
  });
}

let handlersInstalled = false;
// Install once at module load. In dev with HMR, the `handlersInstalled`
// flag prevents re-registration.
installSignalHandlers();

/**
 * Random UUID without an extra dep. Sufficient for in-memory job ids.
 */
function makeId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a document for background processing.
 *
 * Idempotent in the sense that calling it twice for the same document
 * produces two jobs (each calls `processDocument`). The DB row's
 * `processingStatus` is the source of truth — `processDocument` itself
 * is the only writer of that field.
 *
 * If the queue is shutting down (accepting=false), this is a no-op and
 * returns `{ jobId: "" }`. The caller should handle this case.
 */
export function enqueueDocumentProcessing(documentId: string): { jobId: string } {
  if (!accepting) {
    log.warn("processing-queue", "enqueue rejected (shutting down)", { documentId });
    return { jobId: "" };
  }
  // Phase 13: also write a durable ProcessingJob row. The durable row
  // is the source of truth for status, attempts, and recovery after
  // a crash. The in-process job is the executor. If the durable
  // write fails (e.g. disk full), we still enqueue the in-process
  // job — the failure is logged and the verify-phase13 script
  // exposes it. The in-process queue's `accepting` flag has already
  // been checked, so the queue is open.
  const inMemoryId = makeId();
  // Use a placeholder job to record the in-memory id; the persistent
  // id is filled in async below. We kick the async creation BEFORE
  // the setImmediate(pump) so the worker can pick the job up
  // immediately and find a valid persistentJobId when it tries to
  // claim. (The claim is awaited inside runJob.)
  const job: ProcessingJob = {
    id: inMemoryId,
    documentId,
    persistentJobId: "",
    enqueuedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    status: "pending",
    error: null,
  };
  jobs.set(job.id, job);
  pendingQueue.push(job.id);

  log.info("processing-queue", "enqueue", {
    documentId,
    jobId: job.id,
    pendingBefore: pendingQueue.length - 1,
  });

  // Create the durable row asynchronously. We use setImmediate so the
  // caller (the upload action) returns first. The create is awaited
  // by the worker when it picks the job up — see runJob.
  setImmediate(async () => {
    try {
      const { jobId: persistentJobId } = await createProcessingJob(documentId);
      if (persistentJobId) {
        // Patch the in-memory job with the persistent id.
        const live = jobs.get(inMemoryId);
        if (live) live.persistentJobId = persistentJobId;
      }
    } catch (err) {
      log.error("processing-queue", "failed to create durable ProcessingJob", {
        documentId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue. The in-process job is still enqueued; the worker
      // will log a warning when it cannot find a persistent row.
    }
    // Kick the worker regardless of whether the durable row exists.
    pump();
  });

  return { jobId: job.id };
}

/**
 * Get the state of a job by id. Returns null if the job is unknown.
 */
export function getJob(jobId: string): ProcessingJob | null {
  return jobs.get(jobId) ?? null;
}

/**
 * Get all jobs for a given document id. Returns a list, ordered by
 * enqueue time (most recent last).
 */
export function getJobsForDocument(documentId: string): ProcessingJob[] {
  return Array.from(jobs.values())
    .filter((j) => j.documentId === documentId)
    .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

/**
 * Get queue statistics. Useful for the verify script and for any
 * future admin / monitoring surface.
 */
export function getQueueStats(): {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  concurrency: number;
  totalTracked: number;
} {
  let completed = 0;
  let failed = 0;
  for (const j of jobs.values()) {
    if (j.status === "completed") completed++;
    else if (j.status === "failed") failed++;
  }
  return {
    pending: pendingQueue.length,
    running: runningCount,
    completed,
    failed,
    concurrency,
    totalTracked: jobs.size,
  };
}

/**
 * Set the concurrency limit. Used by the verify script to test
 * behavior under higher/lower concurrency. Must be a positive integer.
 */
export function setConcurrency(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  concurrency = n;
  // If we just increased concurrency, pump the queue.
  if (n > runningCount + pendingQueue.length) {
    setImmediate(pump);
  }
}

/**
 * Wait for a specific job to reach a terminal state, or for the
 * timeout to elapse. Returns the final status (or 'timeout' if the
 * wait timed out before the job finished).
 *
 * Used by the verify-phase9 script to assert queue behavior.
 */
export function waitForJob(
  jobId: string,
  timeoutMs = 30000
): Promise<JobStatus | "timeout" | "unknown"> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const job = jobs.get(jobId);
      if (!job) {
        resolve("unknown");
        return;
      }
      if (job.status === "completed" || job.status === "failed") {
        resolve(job.status);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve("timeout");
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Wait for the queue to fully drain (no pending, no running jobs).
 * Useful for cleanup in tests.
 */
export function waitForDrain(timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    if (pendingQueue.length === 0 && runningCount === 0) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const resolver = () => {
      if (pendingQueue.length === 0 && runningCount === 0) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(resolver, 50);
    };
    drainResolvers.push(resolver);
  });
}

/**
 * Reset queue state. Test-only helper. Not exported to library
 * consumers (verify-phase9 imports it directly).
 */
export function _resetForTests(): void {
  jobs.clear();
  pendingQueue.length = 0;
  runningCount = 0;
  drainResolvers = [];
  concurrency = DEFAULT_CONCURRENCY;
  accepting = true;
}

// ─── Internal: worker pump ──────────────────────────────────────────────────

async function pump(): Promise<void> {
  while (runningCount < concurrency && pendingQueue.length > 0) {
    const jobId = pendingQueue.shift();
    if (!jobId) break;
    const job = jobs.get(jobId);
    if (!job) continue; // raced with a reset; skip.
    if (job.status !== "pending") continue;

    runningCount++;
    job.status = "running";
    job.startedAt = Date.now();

    // Run the job without blocking the pump loop.
    void runJob(job)
      .catch((err) => {
        // runJob handles its own errors; this catch is belt-and-suspenders.
        log.error("processing-queue", "unexpected pump error", {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        runningCount--;
        // If anyone is waiting for the queue to drain, resolve them.
        if (pendingQueue.length === 0 && runningCount === 0) {
          const resolvers = drainResolvers;
          drainResolvers = [];
          for (const r of resolvers) r();
        }
        // Try to start more jobs.
        setImmediate(pump);
      });
  }
}

async function runJob(job: ProcessingJob): Promise<void> {
  // Phase 13: claim the durable ProcessingJob row. The claim is a
  // compareAndSwap on status=SCHEDULED, so if another worker has
  // already claimed the row we skip. The in-process queue is the
  // single worker in this build, but the claim is what makes the
  // table the source of truth for "is this job still alive?"
  if (job.persistentJobId) {
    const claim = await claimJob(job.persistentJobId);
    if (!claim) {
      log.warn("processing-queue", "durable job already claimed; skipping", {
        jobId: job.id,
        persistentJobId: job.persistentJobId,
        documentId: job.documentId,
      });
      job.status = "completed";
      job.finishedAt = Date.now();
      job.error = null;
      return;
    }
  } else {
    // The durable row wasn't created in time (or the create failed).
    // We log and continue — the in-process job is still useful for
    // the user-visible behavior (the DB row's processingStatus is
    // updated by processDocument itself). The verify-phase13 script
    // catches this case.
    log.warn("processing-queue", "no durable ProcessingJob id; running in-memory only", {
      jobId: job.id,
      documentId: job.documentId,
    });
  }

  try {
    await processDocument(job.documentId);
    job.status = "completed";
    job.finishedAt = Date.now();
    job.error = null;
    if (job.persistentJobId) await completeJob(job.persistentJobId);
    log.info("processing-queue", "completed", {
      jobId: job.id,
      documentId: job.documentId,
      durationMs: job.finishedAt - (job.startedAt ?? job.finishedAt),
    });
  } catch (err) {
    // The two failure modes we care about:
    //   1. processDocument threw because the document row was deleted
    //      between enqueue and worker pickup. This is not a processing
    //      failure; it is a no-op. Phase 13 also covers the case
    //      where the document or its parent case was soft-deleted
    //      between enqueue and worker pickup.
    //   2. processDocument threw for any other reason.
    // processDocument itself handles storage/parsing failures by writing
    // FAILED to the DB; the throws we expect to see here are:
    //   - "Document not found: <id>" (the early-existence check at the
    //     top of processDocument).
    //   - "An operation failed because it depends on one or more
    //     records that were required but not found. Record to update
    //     not found." (Prisma's "Record to update not found" error
    //     when a later prisma.document.update fires after the row
    //     was deleted).
    //   - "Foreign key constraint violated on the constraint" if a
    //     cascade delete races with the transaction.
    const msg = err instanceof Error ? err.message : String(err);
    const isDeletedDoc =
      msg.includes("Document not found") ||
      msg.includes("Record to update not found") ||
      msg.includes("Foreign key constraint");
    if (isDeletedDoc) {
      // Treat as completed — the document was deleted before we could
      // process it. Nothing to do. Phase 13: also mark the durable
      // row as CANCELLED so the operator can see why the job ended.
      job.status = "completed";
      job.finishedAt = Date.now();
      job.error = null;
      if (job.persistentJobId) await cancelJob(job.persistentJobId, msg);
      log.info("processing-queue", "skipped: document deleted", {
        jobId: job.id,
        documentId: job.documentId,
      });
      return;
    }
    job.status = "failed";
    job.finishedAt = Date.now();
    job.error = msg.slice(0, 500);
    if (job.persistentJobId) await failJob(job.persistentJobId, msg);
    log.error("processing-queue", "failed", {
      jobId: job.id,
      documentId: job.documentId,
      error: job.error,
    });
  }
}
