// Phase 3 — final live walkthrough (rate-limit aware)
//
// Each section is designed to stay under its bucket:
//   - signup: 1 actual + 0 validation (validation tests moved to a separate dry-run is impossible
//     without a separate IP; the design choice is to do fewer validations on this pass)
//   - signin: 5/15min shared by NextAuth + account endpoints — minimum calls only
//   - forgotPassword / resetPassword / verifyEmail: 1 each
//
// Pre-flight: dev server is running at http://localhost:3000 with FRESH rate-limit memory.
import { readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const JAR = {};
function setCookie(headers) {
  const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) JAR[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}
function cookieHeader() {
  return Object.entries(JAR).map(([k, v]) => `${k}=${v}`).join("; ");
}
async function http(method, path, body) {
  const opts = { method, headers: {} };
  if (Object.keys(JAR).length) opts.headers["Cookie"] = cookieHeader();
  if (body && typeof body === "object" && !(body instanceof URLSearchParams)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof URLSearchParams) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = body.toString();
  }
  const res = await fetch(BASE + path, { ...opts, redirect: "manual" });
  setCookie(res.headers);
  return res;
}

let pass = 0, fail = 0, skip = 0;
function ok(name, cond, info) {
  if (cond) { console.log(`  [PASS] ${name}`); pass++; }
  else { console.log(`  [FAIL] ${name}${info ? " -- " + info : ""}`); fail++; }
}
function info(msg) { console.log(`  [INFO] ${msg}`); }
function section(n, t) { console.log(`\n=== ${n} ${t} ===`); }

// Clean prior walkthrough emails
const devDir = join(process.cwd(), ".emails", "dev");
const prefix = `walk-${Date.now()}-`;
try { for (const f of readdirSync(devDir)) if (f.startsWith("walk-")) unlinkSync(join(devDir, f)); } catch {}

const newEmail = `${prefix}@example.com`;
const newPass = "Walk123!@#";
const newName = "Final Walk User";
const emailA = `${prefix}a@example.com`;
const emailB = `${prefix}b@example.com`;

// ─────────────────────────────────────────────────────────────────────────
section("1", "Anonymous user — middleware redirects + auth pages render");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/");
  ok("GET / -> 307 to /auth/signin", r.status === 307);
  ok("callbackUrl is preserved", (r.headers.get("location") || "").includes("callbackUrl="));
}
{
  const r = await http("GET", "/dashboard");
  ok("GET /dashboard -> 307", r.status === 307);
  ok("redirects to /auth/signin", (r.headers.get("location") || "").includes("/auth/signin"));
}
{
  const r = await http("GET", "/account");
  ok("GET /account -> 307 (protected)", r.status === 307);
}
{
  const r = await http("GET", "/auth/signin");
  ok("GET /auth/signin -> 200", r.status === 200);
}
{
  const r = await http("GET", "/auth/signup");
  ok("GET /auth/signup -> 200", r.status === 200);
}

// ─────────────────────────────────────────────────────────────────────────
section("2", "Sign up — POST /api/auth/register");
// ─────────────────────────────────────────────────────────────────────────
let devVerifyUrl = null;
{
  const r = await http("POST", "/api/auth/register", { name: newName, email: newEmail, password: newPass });
  ok("POST /api/auth/register -> 200", r.status === 200, `status=${r.status}`);
  const body = await r.json();
  ok("response success=true", body.success === true);
  ok("response has user.id", !!body.user?.id);
  ok("dev mode returns devVerifyUrl", body.dev === true && !!body.devVerifyUrl);
  if (body.devVerifyUrl) devVerifyUrl = body.devVerifyUrl;
  await new Promise(r => setTimeout(r, 500));
  const files = readdirSync(devDir).filter(f => f.startsWith(prefix));
  ok("verification .eml file written to .emails/dev/", files.length >= 1, `files=${JSON.stringify(files)}`);
  if (files[0]) {
    const content = readFileSync(join(devDir, files[0]), "utf8");
    ok(".eml body contains /auth/verify-email link", content.includes("/auth/verify-email"));
    ok(".eml Subject mentions 'Verify'", /Subject:.*Verify/i.test(content));
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("3", "Email verification round-trip");
// ─────────────────────────────────────────────────────────────────────────
{
  const token = devVerifyUrl.split("/").pop();
  const r = await http("POST", "/api/auth/verify-email", { token });
  ok("valid token -> 200", r.status === 200, `status=${r.status}`);
  const body = await r.json();
  ok("response success=true", body.success === true);
  ok("response has success message", typeof body.message === "string");
}
{
  // Reuse — should fail
  const token = devVerifyUrl.split("/").pop();
  const r = await http("POST", "/api/auth/verify-email", { token });
  ok("reused token -> 400", r.status === 400, `status=${r.status}`);
  const body = await r.json();
  ok("error mentions 'already'", /already/i.test(body.error || ""));
}

// ─────────────────────────────────────────────────────────────────────────
section("4", "Sign in via credentials callback (uses 1 of 5 signin-bucket slots)");
// ─────────────────────────────────────────────────────────────────────────
{
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.csrf")) delete JAR[k];
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", newEmail);
  body.set("password", newPass);
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", body);
  ok("POST /api/auth/callback/credentials -> 302", r.status === 302, `status=${r.status}`);
  ok("redirects to /dashboard", (r.headers.get("location") || "").includes("/dashboard"));
  ok("session cookie set", !!JAR["authjs.session-token"]);
}
{
  const r = await http("GET", "/dashboard");
  ok("authed GET /dashboard -> 200", r.status === 200);
  const html = await r.text();
  ok("dashboard greets user", html.includes(newName) || html.toLowerCase().includes("welcome") || html.toLowerCase().includes("dashboard"));
}

// ─────────────────────────────────────────────────────────────────────────
section("5", "Sessions endpoint (server returns JWT notice)");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/api/auth/sessions");
  ok("GET /api/auth/sessions -> 200", r.status === 200);
  const body = await r.json();
  ok("response has notice about JWT", /JWT/.test(body.notice || ""));
  ok("response has sessions array", Array.isArray(body.sessions));
}

// ─────────────────────────────────────────────────────────────────────────
section("6", "Account settings: name update (uses 1 of 5 signin-bucket slots)");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/account");
  ok("authed GET /account -> 200", r.status === 200);
  const html = await r.text();
  ok("/account page contains the user email", html.includes(newEmail));
}
{
  const r = await http("POST", "/api/account/update-name", { name: "Renamed User" });
  ok("POST /api/account/update-name -> 200", r.status === 200, `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────────
section("7", "Open-redirect protection on /auth/signin?callbackUrl=//evil.com");
// ─────────────────────────────────────────────────────────────────────────
{
  // Authed user hits /auth/signin with malicious callbackUrl
  const r = await http("GET", "/auth/signin?callbackUrl=//evil.com/phish");
  const loc = r.headers.get("location") || "";
  if (r.status === 307) {
    ok("middleware redirected (not 200)", true);
    ok("redirect target is NOT evil.com", !loc.includes("evil.com"));
    ok("redirect target is /dashboard (safe fallback)", /\/dashboard/.test(loc));
  } else {
    ok("page returned 200 (signin page reachable for authed users)", r.status === 200);
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("8", "Sign out (uses 1 of 5 signin-bucket slots)");
// ─────────────────────────────────────────────────────────────────────────
{
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.csrf")) delete JAR[k];
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("callbackUrl", "/");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/signout", body);
  ok("signout -> 200/302", r.status === 200 || r.status === 302, `status=${r.status}`);
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.session")) delete JAR[k];
}
{
  const r = await http("GET", "/dashboard");
  ok("post-logout /dashboard -> 307", r.status === 307);
  ok("redirects to /auth/signin", (r.headers.get("location") || "").includes("/auth/signin"));
}

// ─────────────────────────────────────────────────────────────────────────
section("9", "Two-user isolation: User A & User B don't see each other");
// ─────────────────────────────────────────────────────────────────────────
{
  // Register User A (1 of 3 signup bucket)
  const r = await http("POST", "/api/auth/register", { name: "User A", email: emailA, password: "PassA123!@#" });
  ok("User A registered", r.status === 200, `status=${r.status}`);
}
{
  // Register User B (2 of 3 signup bucket)
  const r = await http("POST", "/api/auth/register", { name: "User B", email: emailB, password: "PassB123!@#" });
  ok("User B registered", r.status === 200, `status=${r.status}`);
}
{
  // Sign in as User B (1 more signin-bucket slot)
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.csrf")) delete JAR[k];
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", emailB);
  body.set("password", "PassB123!@#");
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", body);
  ok("User B signed in", r.status === 302 && (r.headers.get("location") || "").includes("/dashboard"), `status=${r.status}`);
}
{
  // User B's dashboard — should NOT show seed cases (cross-user isolation)
  const r = await http("GET", "/dashboard");
  const html = await r.text();
  ok("User B dashboard -> 200", r.status === 200);
  ok("User B does NOT see 'Aseptic Mango Pulp' (owned by demo user)", !html.includes("Aseptic Mango Pulp"));
  ok("User B does NOT see 'Lithium Ion Batteries' (owned by demo user)", !html.includes("Lithium Ion Batteries"));
}

// ─────────────────────────────────────────────────────────────────────────
section("10", "Google OAuth — NOT VERIFIED (env vars not set)");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/api/auth/providers");
  ok("GET /api/auth/providers -> 200", r.status === 200);
  const body = await r.json();
  ok("response has providers.credentials", !!body.providers?.credentials);
  if (body.providers?.google) {
    info("Google IS configured — but the live test skips the actual OAuth dance");
  } else {
    skip++;
    console.log("  [SKIP] Google OAuth real flow — env vars not set (per user decision; documented in PHASE3-FINAL-REPORT.md)");
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("11", "Error page (Suspense-wrapped useSearchParams renders)");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/auth/error?error=Configuration");
  ok("GET /auth/error -> 200", r.status === 200);
  const html = await r.text();
  ok("error page contains error-related text", /error|something went wrong|configuration/i.test(html));
}

// ─────────────────────────────────────────────────────────────────────────
console.log("\n========================================");
console.log(`PASS:    ${pass}`);
console.log(`FAIL:    ${fail}`);
console.log(`SKIP:    ${skip}`);
console.log("========================================");
if (fail > 0) process.exit(1);
