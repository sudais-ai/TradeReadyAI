/**
 * Phase 6 — namespaced log utility with secret redaction.
 *
 * This is intentionally a thin wrapper around `console.*` so Phase 18
 * (observability / security) can swap the sink (e.g. OpenTelemetry, Sentry)
 * without re-plumbing every call site.
 *
 * Existing actions still use `console.error` directly; this module is the
 * importable surface for new code and for the Phase 6 verification script.
 */

type Level = "info" | "warn" | "error" | "debug";

const SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "sessiontoken",
  "secret",
  "apikey",
  "clientsecret",
  "reset",
  "authorization",
  "cookie",
  "accesstoken",
  "refreshtoken",
  "idtoken",
]);

function normalize(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(normalize(key));
}

function stripSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => stripSecrets(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSecretKey(k) ? "[REDACTED]" : stripSecrets(v, seen);
  }
  return out;
}

function emit(
  level: Level,
  ns: string,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const ts = new Date().toISOString();
  const safeMeta = meta ? ` ${JSON.stringify(stripSecrets(meta))}` : "";
  const line = `[${ts}] [${level.toUpperCase()}] [${ns}] ${msg}${safeMeta}`;
  // `console.debug` is silenced by Next.js by default; we route `debug`
  // through `console.log` to keep it visible during dev without polluting
  // production logs (where it can be filtered by log level downstream).
  const sink = level === "debug" ? console.log : console[level];
  sink(line);
}

export const log = {
  info: (ns: string, msg: string, meta?: Record<string, unknown>) =>
    emit("info", ns, msg, meta),
  warn: (ns: string, msg: string, meta?: Record<string, unknown>) =>
    emit("warn", ns, msg, meta),
  error: (ns: string, msg: string, meta?: Record<string, unknown>) =>
    emit("error", ns, msg, meta),
  debug: (ns: string, msg: string, meta?: Record<string, unknown>) =>
    emit("debug", ns, msg, meta),
};

/**
 * Phase 8: strip high-entropy secrets from a URL before logging.
 *
 * The Phase 6 `stripSecrets` only redacts keys in objects; it does not see
 * tokens embedded in free-text URLs (e.g. `/auth/reset-password?token=abc...`
 * or `/auth/verify-email/<hex-token>`). Without this helper, a dev-mode
 * log of a verification link would persist the 32-byte token to disk.
 *
 * Replaces the VALUE of common sensitive query params with `[REDACTED]`
 * while preserving the path and the rest of the query string. Also
 * redacts the path segment after `/auth/verify-email/` and
 * `/auth/reset-password/` (both shapes appear in the codebase).
 */
export function redactUrlQuery(url: string): string {
  if (!url || typeof url !== "string") return url;
  let out = url;
  // 1. Query-string values: ?token=... &resetToken=... etc.
  out = out.replace(
    /([?&](?:token|resetToken|verifyToken|accessToken|refreshToken|idToken|code|state)=)([^&]*)/gi,
    "$1[REDACTED]"
  );
  // 2. Path-embedded token after /auth/verify-email/<hex> (e.g. 64 hex chars).
  out = out.replace(
    /(\/auth\/verify-email\/)([0-9a-f]{32,})/gi,
    "$1[REDACTED]"
  );
  // 3. Path-embedded token after /auth/reset-password/<hex> (defensive).
  out = out.replace(
    /(\/auth\/reset-password\/)([0-9a-f]{32,})/gi,
    "$1[REDACTED]"
  );
  return out;
}
