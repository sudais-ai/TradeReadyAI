/**
 * Phase 13 — centralized audit-log helper.
 *
 * `recordAuditEvent` is the single write path for the AuditLog table.
 * Every security-relevant mutation (case create/update/delete, document
 * create/delete, password change, password reset, processing failure)
 * goes through this helper. The helper is best-effort: an audit-write
 * failure must NOT roll back the original mutation, because the
 * mutation is the more important event and the user has already
 * committed to it. Failures are logged through the Phase 6 `log`
 * utility so the operator can investigate.
 *
 * Security:
 *   - `metadata` is a free-form JSON string. The helper does NOT
 *     validate its contents, so callers must not put passwords,
 *     password hashes, JWTs, session tokens, or API keys in it.
 *   - `ip` and `userAgent` are captured when available (from the
 *     NextRequest headers). They are stored as-is.
 *
 * The audit log is read by the owning user only (no admin role).
 * Server-side enforcement is in the read endpoint
 * `src/app/api/audit/route.ts`.
 */
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";

/**
 * Stable, namespaced action names. Keep this list aligned with the
 * phase-13 verification script and the audit-log doc.
 */
export const AUDIT_ACTIONS = {
  // TradeCase
  TRADE_CASE_CREATED: "TRADE_CASE_CREATED",
  TRADE_CASE_UPDATED: "TRADE_CASE_UPDATED",
  TRADE_CASE_DELETED: "TRADE_CASE_DELETED",
  TRADE_CASE_RESTORED: "TRADE_CASE_RESTORED",
  // Document
  DOCUMENT_CREATED: "DOCUMENT_CREATED",
  DOCUMENT_DELETED: "DOCUMENT_DELETED",
  DOCUMENT_RESTORED: "DOCUMENT_RESTORED",
  // Auth
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  // Processing
  DOCUMENT_PROCESSING_COMPLETED: "DOCUMENT_PROCESSING_COMPLETED",
  DOCUMENT_PROCESSING_FAILED: "DOCUMENT_PROCESSING_FAILED",
  // Stale recovery
  STALE_JOB_RECOVERED: "STALE_JOB_RECOVERED",
} as const;

export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGETS = {
  USER: "User",
  TRADE_CASE: "TradeCase",
  DOCUMENT: "Document",
  PROCESSING_JOB: "ProcessingJob",
} as const;

export type AuditTarget =
  (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];

export interface AuditEventInput {
  /** Actor (signed-in user). null for system-initiated events. */
  userId: string | null;
  /** Stable action name. Use the AUDIT_ACTIONS constants. */
  action: AuditAction | string;
  /** Target entity type. Use the AUDIT_TARGETS constants. */
  target: AuditTarget | string;
  /** Target id (e.g. tradeCaseId, documentId). null when not applicable. */
  targetId?: string | null;
  /** Free-form structured metadata. Never store secrets here. */
  metadata?: Record<string, unknown> | null;
  /** Client IP if known. */
  ip?: string | null;
  /** Client user-agent if known. */
  userAgent?: string | null;
}

/**
 * Write one audit-log row. Best-effort: never throws to the caller.
 * Returns `{ ok: true, id }` on success, `{ ok: false, error }` on
 * failure. The caller decides what to do with the result (most
 * callers ignore it; the verify-phase13 script asserts on it).
 */
export async function recordAuditEvent(
  event: AuditEventInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    // Serialize metadata to a stable JSON string. We do not allow
    // arbitrary key paths here — the caller is trusted to have
    // scrubbed secrets. The redaction is a defense-in-depth: if
    // a caller accidentally includes a `password` field, we strip it.
    const safeMetadata = scrubMetadata(event.metadata);
    const row = await prisma.auditLog.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        target: event.target,
        targetId: event.targetId ?? null,
        metadata: safeMetadata ? JSON.stringify(safeMetadata) : null,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("audit", "failed to record audit event", {
      action: event.action,
      target: event.target,
      targetId: event.targetId,
      error: msg,
    });
    return { ok: false, error: msg };
  }
}

/**
 * Remove known-secret keys from a metadata object before it is
 * serialized. Defense-in-depth: callers should not put secrets in
 * metadata, but if they do, we strip them at the boundary.
 */
function scrubMetadata(meta: Record<string, unknown> | null | undefined):
  Record<string, unknown> | null {
  if (!meta) return null;
  const SECRET_KEYS = new Set([
    "password",
    "passwordHash",
    "passwordhash",
    "token",
    "sessionToken",
    "sessiontoken",
    "secret",
    "apiKey",
    "apikey",
    "clientSecret",
    "clientsecret",
    "authorization",
    "cookie",
    "accessToken",
    "accesstoken",
    "refreshToken",
    "refreshtoken",
    "idToken",
    "idtoken",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubMetadata(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
