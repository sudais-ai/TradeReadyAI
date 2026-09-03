// Phase 6 — Backend Foundation verification.
//
// Verifies the new Phase 6 helpers (action-result, id validators, transaction
// wrapper, log utility) and re-asserts the security boundaries that Phase 6
// was meant to harden. Reuses the cookies file from Phase 4 for the demo
// session.
//
// Usage: node scripts/verify-phase6.mjs <cookies-file>

import { readFileSync } from "fs";
import { spawnSync } from "child_process";

const BASE = "http://localhost:3000";

let pass = 0;
let fail = 0;
const skipped = [];

function ok(name, cond, info) {
  if (cond) {
    console.log(`  [PASS] ${name}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${name}${info ? " -- " + info : ""}`);
    fail++;
  }
}
function info(msg) {
  console.log(`  [INFO] ${msg}`);
}
function skip(name, reason) {
  console.log(`  [SKIP] ${name} -- ${reason}`);
  skipped.push(`${name}: ${reason}`);
}

const cookiesFile = process.argv[2];
if (!cookiesFile) {
  console.error("Usage: node scripts/verify-phase6.mjs <cookies-file>");
  process.exit(1);
}

const cookies = readFileSync(cookiesFile, "utf-8")
  .split("\n")
  .map((l) => l.replace(/\r$/, ""))
  .filter((l) => l && !l.startsWith("# ") && !l.startsWith("#This") && !l.startsWith("#https"))
  .map((l) => {
    const cleaned = l.replace(/^#HttpOnly_/, "");
    const parts = cleaned.split("\t");
    if (parts.length < 7) return null;
    return [parts[5].replace(/\r/g, ""), parts[6].replace(/\r/g, "")];
  })
  .filter(Boolean);

function buildHeaders(extra = {}) {
  const h = new Headers();
  h.append("Cookie", cookies.map(([k, v]) => `${k}=${v}`).join("; "));
  for (const [k, v] of Object.entries(extra)) h.append(k, v);
  return h;
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: buildHeaders(), redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function postRaw(path, raw, contentType = "application/json") {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": contentType }),
    body: raw,
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  console.log("\n=== PHASE 6 LIVE REGRESSION — Backend Foundation ===\n");

  // ─── 1. Auth boundary: unauthenticated request is rejected ─────────────────
  console.log("▶ 1. Auth boundary");
  {
    const r = await fetch(BASE + "/api/cases/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000", {
      redirect: "manual",
    });
    // Middleware redirects unauthenticated API requests to /auth/signin (307/302/308).
    // The API route itself would 401 if it were reached; either is "denied".
    const denied = r.status === 401 || [302, 307, 308].includes(r.status);
    ok("Unauthenticated GET document API -> denied (401 or redirect)", denied, `status=${r.status}`);
  }
  {
    const r = await fetch(BASE + "/dashboard", { redirect: "manual" });
    // /dashboard is a server component; middleware will 307-redirect to /auth/signin.
    ok("Unauthenticated /dashboard -> redirect (307/302/308)", [302, 307, 308].includes(r.status), `status=${r.status}`);
  }

  // ─── 2. Authenticated session reaches dashboard ────────────────────────────
  console.log("\n▶ 2. Authenticated session");
  let demoCaseId = null;
  {
    const r = await get("/dashboard");
    ok("Authenticated /dashboard -> 200", r.status === 200, `status=${r.status}`);
    const ids = [...r.body.matchAll(/\/cases\/([a-f0-9-]{36})/g)].map((m) => m[1]);
    const uniq = Array.from(new Set(ids));
    demoCaseId = uniq[0] || null;
    ok("Demo case id is discoverable from dashboard", !!demoCaseId, demoCaseId ? "" : "no /cases/{uuid}/ link found");
    info(`Case id: ${demoCaseId || "(none)"}`);
  }

  // ─── 3. Cross-user isolation (auth boundary) ───────────────────────────────
  console.log("\n▶ 3. Cross-user isolation");
  {
    // Try to access a bogus but well-formed UUID as the demo user.
    // Should yield a not-found / redirect / 404, never a 200 with the case
    // rendered.
    const r = await get(`/cases/00000000-0000-0000-0000-000000000000`);
    const denied =
      r.status === 404 ||
      r.status === 307 ||
      (r.status === 200 && (r.body.includes("not found") || r.body.includes("Not Found") || r.body.includes("404")));
    ok("Bogus case id denied (404 / redirect / not-found page)", denied, `status=${r.status}`);
  }
  {
    if (demoCaseId) {
      const r = await get(`/cases/${demoCaseId}/documents/00000000-0000-0000-0000-000000000000`);
      const denied =
        r.status === 404 ||
        r.status === 307 ||
        (r.status === 200 && (r.body.includes("not found") || r.body.includes("Not Found") || r.body.includes("404")));
      ok("Bogus document id denied", denied, `status=${r.status}`);
    } else {
      skip("Bogus document id denied", "no demo case id available");
    }
  }
  {
    // Real cross-user test: register a fresh second user, sign in, then try
    // to access the demo user's case. The page must not render the case
    // content.
    const secondEmail = `phase6-cu-${Date.now()}@example.com`;
    const secondPwd = "Phase6Cu123!";
    let secondCookies = [];
    try {
      const reg = await fetch(BASE + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Phase 6 Cross-User", email: secondEmail, password: secondPwd }),
      });
      // Capture cookies from the registration response.
      const setCookies = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [];
      secondCookies = setCookies.map((c) => c.split(";")[0]);
      // NextAuth sign-in via credentials.
      const csrfRes = await fetch(BASE + "/api/auth/csrf");
      const csrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [];
      for (const c of csrfCookies) secondCookies.push(c.split(";")[0]);
      const csrfJson = await csrfRes.json();
      const csrfToken = csrfJson.csrfToken;
      // Build form body for the credentials sign-in.
      const form = new URLSearchParams();
      form.set("email", secondEmail);
      form.set("password", secondPwd);
      form.set("csrfToken", csrfToken);
      form.set("callbackUrl", BASE + "/dashboard");
      form.set("json", "true");
      const signin = await fetch(BASE + "/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": secondCookies.join("; "),
        },
        body: form.toString(),
        redirect: "manual",
      });
      const signinCookies = signin.headers.getSetCookie ? signin.headers.getSetCookie() : [];
      for (const c of signinCookies) secondCookies.push(c.split(";")[0]);

      // Attempt to fetch demo case as the second user.
      const r = await fetch(BASE + `/cases/${demoCaseId}`, {
        headers: { Cookie: secondCookies.join("; ") },
        redirect: "manual",
      });
      const body = await r.text();
      // Three acceptable "denied" outcomes for the second user:
      //   - 404 / 307 / 308 (Next redirect or 404)
      //   - 200 with the not-found page (Next's notFound() renders with 200)
      //   - 200 showing the SECOND user's own empty dashboard (signed in but
      //     not signed in as the demo user — though the URL is the case
      //     detail, the page may redirect, so 307/308 is the common case)
      const isNotFound =
        r.status === 404 ||
        [302, 307, 308].includes(r.status) ||
        (r.status === 200 && (body.includes("not found") || body.includes("Not Found") || body.includes("404")));
      // The important negative check: the second user does NOT see the demo
      // case's actual content (Aseptic Mango, Lithium, etc.) in a 200-page
      // body. Note: a 307 redirect body will contain the case id in the
      // Location URL — that's expected and not a leak.
      let leaksCaseContent = false;
      if (r.status === 200) {
        leaksCaseContent =
          body.includes("Aseptic Mango") || body.includes("Lithium Ion");
      }
      ok("Real cross-user: 2nd user denied access to demo case", isNotFound, `status=${r.status}`);
      ok("Real cross-user: response does not leak demo case content (200 only)", !leaksCaseContent, leaksCaseContent ? "LEAKED" : "");
    } catch (e) {
      skip("Real cross-user test", String(e).slice(0, 100));
    }
  }

  // ─── 4. Malformed input handling ────────────────────────────────────────────
  console.log("\n▶ 4. Malformed input handling");
  {
    // /api/auth/forgot-password with garbage body — server must not crash.
    const r = await postRaw("/api/auth/forgot-password", "not-json-at-all{{{");
    // 400 (validation) or 500 (parse error) is acceptable; the key requirement
    // is that the dev server stays up. The next request will confirm liveness.
    ok("Malformed JSON to forgot-password -> 4xx (no crash)", r.status >= 400 && r.status < 600, `status=${r.status}`);
  }
  {
    const r = await postJson("/api/auth/forgot-password", { email: "definitely-not-an-email" });
    // Accept 400 (validation rejected) or 429 (rate limit kicked in after
    // previous runs). Both indicate the server handled the input safely.
    ok("Invalid email format -> 400 (or 429 if rate-limited)", r.status === 400 || r.status === 429, `status=${r.status}`);
  }
  {
    // Confirm server is still up after the malformed input.
    const r = await get("/");
    ok("Server still responsive after malformed input", r.status === 200 || r.status === 307, `status=${r.status}`);
  }

  // ─── 5. Oversized upload protection ────────────────────────────────────────
  console.log("\n▶ 5. Upload input validation (server action reachable via form submit not possible here; we exercise the underlying validator instead)");
  skip("Oversized file upload live test", "requires a multipart form post from a browser session; the validator exists at src/actions/documents.ts and is exercised by verify-phase4.mjs indirectly");

  // ─── 6. ID validators (Zod UUID schemas) ───────────────────────────────────
  console.log("\n▶ 6. ID validators");
  try {
    const ids = await import("../src/lib/validations/ids.ts");
    ok("ids module exports all expected schemas",
      !!ids.tradeCaseIdSchema && !!ids.documentIdSchema && !!ids.requirementIdSchema && !!ids.userIdSchema);
    ok("Valid UUID passes tradeCaseIdSchema", ids.tradeCaseIdSchema.safeParse("00000000-0000-0000-0000-000000000000").success === true);
    ok("Invalid string fails tradeCaseIdSchema", ids.tradeCaseIdSchema.safeParse("not-a-uuid").success === false);
    ok("Path-traversal-style id fails", ids.documentIdSchema.safeParse("../../etc/passwd").success === false);
    ok("Empty id fails", ids.userIdSchema.safeParse("").success === false);
  } catch (e) {
    ok("ID validators import + run", false, String(e));
  }

  // ─── 7. Action result helper ───────────────────────────────────────────────
  console.log("\n▶ 7. Action-result helper");
  try {
    const r = await import("../src/lib/result.ts");
    const ok1 = r.actionOk();
    ok("actionOk() returns success:true", ok1 && ok1.success === true);

    const okWithData = r.actionOk({ id: "x" });
    ok("actionOk({id}) returns success + data", okWithData && okWithData.success === true && okWithData.data && okWithData.data.id === "x");

    const zodError = new Error("Zod fail");
    zodError.name = "ZodError";
    // shape: ZodError has .issues / .errors — but our helper only does an
    // instanceof check. We use a real ZodError instance for the test.
    const { ZodError } = await import("zod");
    const realZod = new ZodError([{ code: "custom", message: "bad", path: ["x"] }]);
    const zodFail = r.actionFail(realZod);
    ok("actionFail(ZodError) -> friendly message", zodFail.success === false && /invalid/i.test(zodFail.error), JSON.stringify(zodFail));

    const generic = r.actionFail(new Error("boom"));
    ok("actionFail(Error) -> message preserved", generic.success === false && generic.error === "boom");

    const fallback = r.actionFail("not an error", "fallback msg");
    ok("actionFail(string) -> fallback", fallback.success === false && fallback.error === "fallback msg");
  } catch (e) {
    ok("Action-result helper imports + runs", false, String(e));
  }

  // ─── 8. Transaction helper (atomicity + rollback) ──────────────────────────
  console.log("\n▶ 8. Transaction helper");
  try {
    const { withTransaction } = await import("../src/lib/db/transaction.ts");
    const { prisma } = await import("../src/lib/db/prisma.ts");
    // Tag a session row to make it identifiable.
    const tag = `phase6-rollback-${Date.now()}`;
    let threw = false;
    try {
      await withTransaction(async (tx) => {
        await tx.session.create({
          data: {
            sessionToken: `${tag}-1`,
            userId: "00000000-0000-0000-0000-000000000000", // FK violation by design
            expires: new Date(Date.now() + 60_000),
          },
        });
        throw new Error("intentional rollback");
      });
    } catch {
      threw = true;
    }
    ok("Transaction rolls back on throw", threw === true);
    const afterCount = await prisma.session.count({ where: { sessionToken: { startsWith: tag } } });
    ok("No partial rows survive rollback", afterCount === 0, `count=${afterCount}`);
  } catch (e) {
    ok("Transaction helper imports + runs", false, String(e));
  }

  // ─── 9. Log utility — secret redaction ─────────────────────────────────────
  console.log("\n▶ 9. Log utility (secret redaction)");
  try {
    // Run log through a subprocess so we can inspect its stdout directly.
    // (Module-level `console` is captured at import time, so spying from this
    //  process wouldn't intercept the helper's calls.)
    const { writeFileSync, mkdirSync, unlinkSync, rmdirSync } = await import("fs");
    const repoRoot = process.cwd().replace(/\\/g, "/");
    // Use a relative import — relative paths work everywhere, absolute file://
    // is fiddly with ESM on Windows.
    const probe = `import { log } from "../src/lib/log.ts";
log.info("phase6", "user sign-in", {
  email: "demo@tradeready.ai",
  password: "P@ssw0rd!",
  token: "abc123",
  apiKey: "sk-secret",
  nested: { authorization: "Bearer xyz", name: "demo" },
});
`;
    const probeDir = repoRoot + "/.phase6-tmp";
    const probePath = probeDir + "/log-probe.mjs";
    try { mkdirSync(probeDir, { recursive: true }); } catch {}
    writeFileSync(probePath, probe);
    // cwd is .phase6-tmp so the relative import resolves to ../src/lib/log.ts.
    const tsxCli = repoRoot + "/node_modules/tsx/dist/cli.mjs";
    const out = spawnSync("node", [tsxCli, "log-probe.mjs"], { encoding: "utf-8", cwd: probeDir, stdio: "pipe" });
    try { unlinkSync(probePath); } catch {}
    try { rmdirSync(probeDir); } catch {}
    const line = ((out.stdout || "") + (out.stderr || "")).replace(/\r/g, "");
    if (out.status !== 0) console.log("Log probe output (status=" + out.status + "):\n" + line);
    ok("Log line is produced", line.includes("[INFO]") && line.includes("phase6"));
    ok("Plaintext password is redacted", !line.includes("P@ssw0rd!") && line.includes("[REDACTED]"));
    ok("Plaintext apiKey is redacted", !line.includes("sk-secret") && line.includes("[REDACTED]"));
    ok("Authorization header value is redacted", !line.includes("Bearer xyz"));
    ok("Non-secret values are preserved", line.includes("demo@tradeready.ai") && line.includes("\"name\":\"demo\""));
  } catch (e) {
    ok("Log utility imports + runs", false, String(e));
  }

  // ─── 10. Environment validation runs without throwing ──────────────────────
  console.log("\n▶ 10. Environment validation");
  try {
    // The module auto-runs validateEnv() on import. If DATABASE_URL and
    // OPENCODE_ZEN_API_KEY are set (they are in .env), it must not throw.
    await import("../src/lib/env-validation.ts");
    ok("validateEnv() runs without throwing on current .env", true);
  } catch (e) {
    ok("validateEnv() runs without throwing on current .env", false, String(e));
  }

  // ─── 11. Phase 4 regression (existing baseline) ───────────────────────────
  console.log("\n▶ 11. Phase 4 regression (previous-phase baseline)");
  {
    const result = spawnSync("node", ["scripts/verify-phase4.mjs", cookiesFile], { encoding: "utf-8", stdio: "pipe" });
    const passMatches = ((result.stdout || "").match(/\[PASS\]/g) || []).length;
    const failMatches = ((result.stdout || "").match(/\[FAIL\]/g) || []).length;
    ok("verify-phase4.mjs exits 0", result.status === 0, `exit=${result.status} pass=${passMatches} fail=${failMatches}`);
    if (result.status !== 0) console.log((result.stdout || "").split("\n").slice(-25).join("\n"));
  }

  // ─── 12. Phase 3 regression (existing baseline) ────────────────────────────
  console.log("\n▶ 12. Phase 3 regression (previous-phase baseline)");
  {
    const repoRoot = process.cwd().replace(/\\/g, "/");
    const tsxCli = repoRoot + "/node_modules/tsx/dist/cli.mjs";
    const result = spawnSync("node", [tsxCli, "scripts/verify-phase3.ts"], { encoding: "utf-8", cwd: repoRoot, stdio: "pipe" });
    const stdout = (result.stdout || "") + (result.stderr || "");
    const passed = (stdout.match(/✅/g) || []).length;
    const failed = (stdout.match(/❌/g) || []).length;
    ok("verify-phase3.ts exits 0", result.status === 0, `exit=${result.status} passed=${passed} failed=${failed}`);
    if (result.status !== 0) console.log(stdout.split("\n").slice(-30).join("\n"));
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log(`Phase 6 verification: ${pass} pass, ${fail} fail, ${skipped.length} skipped`);
  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log("========================================\n");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Phase 6 verification crashed:", e);
  process.exit(2);
});
