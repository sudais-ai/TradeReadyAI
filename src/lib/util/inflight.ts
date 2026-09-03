/**
 * Phase 16: In-flight action deduplication.
 *
 * A small in-process Set that tracks keys for actions currently being
 * processed by the server. The intent is to prevent two concurrent
 * server-action invocations from racing on the same logical operation
 * (e.g. double-clicking "Analyze" or "Upload Document" with a network
 * retry that re-sends the request).
 *
 * Properties:
 *   - In-memory only. Lost on process restart. Acceptable because the
 *     target is single-instance dev. A multi-instance target would
 *     need a DB-backed CAS column, but that would require a schema
 *     change (out of scope for Phase 16 — see the "DO NOT change the
 *     data model unless absolutely proven necessary" rule).
 *   - Bounded by the `maxEntries` default; oldest key is evicted if the
 *     Set grows past the limit, so a runaway client cannot leak memory.
 *   - `tryClaim()` returns true if the key was newly added (caller
 *     should proceed), false if it was already present (caller should
 *     reject as a duplicate). Always call `release()` in a `finally`.
 *   - FIFO ordering is maintained for the eviction so the most-recent
 *     concurrent claim is the one that's most likely still in flight.
 *
 * The keys are caller-chosen. For the analyze action we use
 * `${tradeCaseId}:${requirementId}` so concurrent evaluations of
 * different requirements are still allowed. For the upload action we
 * use `${tradeCaseId}:${fileName}:${fileSize}` so a second file is
 * never blocked.
 */

const DEFAULT_MAX_ENTRIES = 256;

const inflight = new Set<string>();
const insertionOrder: string[] = [];

function evictIfNeeded(): void {
  while (insertionOrder.length > DEFAULT_MAX_ENTRIES) {
    const oldest = insertionOrder.shift();
    if (oldest !== undefined) {
      inflight.delete(oldest);
    }
  }
}

/**
 * Try to claim `key` for an in-flight operation. Returns true if the
 * key was successfully claimed (caller should run the operation);
 * false if a previous call already holds the claim (caller should
 * reject as a duplicate).
 */
export function tryClaim(key: string): boolean {
  if (inflight.has(key)) {
    return false;
  }
  inflight.add(key);
  insertionOrder.push(key);
  evictIfNeeded();
  return true;
}

/**
 * Release a previously-claimed key. Safe to call even if the key
 * was not held (idempotent); this makes it safe to put in a `finally`.
 */
export function release(key: string): void {
  if (inflight.delete(key)) {
    const i = insertionOrder.indexOf(key);
    if (i >= 0) insertionOrder.splice(i, 1);
  }
}

/** Test-only: clear the in-flight set. Not exported from index. */
export function _resetInflight(): void {
  inflight.clear();
  insertionOrder.length = 0;
}
