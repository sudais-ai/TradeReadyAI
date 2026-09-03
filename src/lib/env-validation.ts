/**
 * Environment variable validation at startup.
 * Fails fast if required configuration is missing.
 */

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "OPENCODE_ZEN_API_KEY",
] as const;

const OPTIONAL_ENV_VARS = [
  "EMBEDDING_PROVIDER",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
  "OCR_MODEL",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_BASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FACEBOOK_CLIENT_ID",
  "FACEBOOK_CLIENT_SECRET",
  "AUTH_TRUST_HOST",
  "NEXTAUTH_URL",
  "AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "EMAIL_FROM",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "PROCESSING_CONCURRENCY",
  "PROCESSING_WORKER_SIGNALS",
  "TRUST_PROXY",
] as const;

export function validateEnv(): void {
  // During `next build`, pages are statically evaluated without access to
  // runtime secrets (they're injected by the hosting platform at request
  // time). Failing fast is still valuable, but it must happen when the
  // server actually starts handling requests, not while Next.js is
  // collecting page data for prerendering.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(", ")}`;
    if (isBuildPhase) {
      console.warn(`[ENV VALIDATION] ${message} (skipping hard failure during build; these must be set in the runtime environment)`);
      return;
    }
    console.error(`[ENV VALIDATION FAILED] ${message}`);
    throw new Error(message);
  }
  
  // Warn about optional but recommended variables
  const missingOptional: string[] = [];
  for (const key of OPTIONAL_ENV_VARS) {
    if (!process.env[key]) {
      missingOptional.push(key);
    }
  }
  
  if (missingOptional.length > 0) {
    console.warn(`[ENV WARNING] Optional environment variables not set: ${missingOptional.join(", ")}`);
  }

  // OAuth providers are only active when both halves of their credentials
  // are present. Log a single line per provider so it's clear which are on.
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log("[ENV] Google OAuth provider: enabled");
  } else {
    console.log("[ENV] Google OAuth provider: not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)");
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    console.log("[ENV] Facebook OAuth provider: enabled");
  } else {
    console.log("[ENV] Facebook OAuth provider: not configured (FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET missing)");
  }

  // Email provider — used for password reset delivery.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    console.log("[ENV] Email provider: Gmail SMTP (GMAIL_USER / GMAIL_APP_PASSWORD)");
  } else if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  ) {
    console.log("[ENV] Email provider: Generic SMTP (SMTP_HOST / SMTP_USER)");
  } else {
    console.log("[ENV] Email provider: DEV FALLBACK (writes to .emails/dev/) — set GMAIL_USER+GMAIL_APP_PASSWORD or SMTP_* for real delivery");
  }
  
  // Validate specific values
  if (process.env.EMBEDDING_PROVIDER && !["local", "dev", "opencode"].includes(process.env.EMBEDDING_PROVIDER)) {
    console.warn(`[ENV WARNING] Unknown EMBEDDING_PROVIDER: ${process.env.EMBEDDING_PROVIDER}. Valid: local, dev, opencode`);
  }
  
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "opencode") {
    console.warn(`[ENV WARNING] Unknown AI_PROVIDER: ${process.env.AI_PROVIDER}. Valid: opencode`);
  }
  
  // Validate API key format (basic check)
  const apiKey = process.env.OPENCODE_ZEN_API_KEY;
  if (apiKey && !apiKey.startsWith("sk-")) {
    console.warn("[ENV WARNING] OPENCODE_ZEN_API_KEY doesn't match expected format (should start with 'sk-')");
  }

  // Phase 12: PROCESSING_CONCURRENCY (positive integer; default 2)
  if (process.env.PROCESSING_CONCURRENCY) {
    const c = parseInt(process.env.PROCESSING_CONCURRENCY, 10);
    if (Number.isNaN(c) || c < 1) {
      console.warn(`[ENV WARNING] PROCESSING_CONCURRENCY='${process.env.PROCESSING_CONCURRENCY}' is not a positive integer; using default 2`);
    } else {
      console.log(`[ENV] Processing queue concurrency: ${c}`);
    }
  }

  // Phase 12: PROCESSING_WORKER_SIGNALS (escape hatch; "0" disables SIGTERM/SIGINT handlers)
  if (process.env.PROCESSING_WORKER_SIGNALS === "0") {
    console.log("[ENV] Processing worker signal handlers: DISABLED (PROCESSING_WORKER_SIGNALS=0)");
  } else {
    console.log("[ENV] Processing worker signal handlers: enabled (SIGTERM/SIGINT drain queue before exit)");
  }

  // Phase 12: TRUST_PROXY (0=never trust, 1=always trust, or comma-separated allow-list of IPs)
  if (process.env.TRUST_PROXY) {
    if (process.env.TRUST_PROXY === "0") {
      console.log("[ENV] Rate limiter: TRUST_PROXY=0 (ignoring X-Forwarded-For)");
    } else if (process.env.TRUST_PROXY === "1") {
      console.log("[ENV] Rate limiter: TRUST_PROXY=1 (always trust X-Forwarded-For — dev mode)");
    } else {
      const allowList = process.env.TRUST_PROXY.split(",").map((s) => s.trim()).filter(Boolean);
      console.log(`[ENV] Rate limiter: TRUST_PROXY allow-list (${allowList.length} entries) — X-Forwarded-For honored only when connecting IP matches`);
    }
  } else {
    const defaultInDev = process.env.NODE_ENV === "development";
    console.log(`[ENV] Rate limiter: TRUST_PROXY unset → default ${defaultInDev ? "1 (dev: trust X-Forwarded-For)" : "0 (prod: ignore X-Forwarded-For)"}`);
  }

  console.log("[ENV VALIDATION] All required environment variables present");
}

// Auto-validate on import in server context
if (typeof window === "undefined") {
  validateEnv();
}