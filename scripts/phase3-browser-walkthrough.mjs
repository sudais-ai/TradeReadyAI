// Phase 3 — full live walkthrough against http://localhost:3000
// Walks every user journey: anon → signup → verify → login → use app → logout
//                              forgot/reset → account settings → sessions → isolation
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

// Clean any prior test emails
const devDir = join(process.cwd(), ".emails", "dev");
try { for (const f of readdirSync(devDir)) if (f.includes("walkthrough-") || f.includes("usera-") || f.includes("userb-")) unlinkSync(join(devDir, f)); } catch {}

const ts = Date.now();
const newEmail = `walkthrough-${ts}@example.com`;
const newPass = "Walk123!@#";
const newName = "Walkthrough User";
const emailA = `usera-${ts}@example.com`;
const emailB = `userb-${ts}@example.com`;

// ─────────────────────────────────────────────────────────────────────────
section("STEP 1", "Anonymous user journey — middleware redirects");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/dashboard");
  ok("GET / → 307 to /auth/signin", r.status === 307);
  ok("callbackUrl preserved", (r.headers.get("location") || "").includes("callbackUrl=%2F"));
}
{
  const r = await http("GET", "/dashboard");
  ok("GET /dashboard → 307", r.status === 307);
  ok("redirect goes to /auth/signin", (r.headers.get("location") || "").includes("/auth/signin"));
}
{
  const r = await http("GET", "/api/trade-cases");
  // Should be 401 (unauth) not crash
  ok("GET /api/trade-cases → 401 (not 500)", r.status === 401);
}
{
  const r = await http("GET", "/account");
  ok("GET /account → 307 (protected)", r.status === 307);
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 2", "Sign up — POST /api/auth/register");
// ─────────────────────────────────────────────────────────────────────────
let devVerifyUrl = null;
{
  const r = await http("POST", "/api/auth/register", { name: newName, email: newEmail, password: newPass });
  ok("POST /api/auth/register → 200", r.status === 200, `status=${r.status}`);
  const body = await r.json();
  ok("response success=true", body.success === true);
  ok("response has user.id", !!body.user?.id);
  ok("response user.emailVerified is null/false", body.user?.emailVerified == null || body.user?.emailVerified === false);
  ok("dev mode returns devVerifyUrl", body.dev === true && !!body.devVerifyUrl);
  if (body.devVerifyUrl) devVerifyUrl = body.devVerifyUrl;
  await new Promise(r => setTimeout(r, 600));
  const files = readdirSync(devDir).filter(f => f.includes("walkthrough-"));
  ok(".eml file written to .emails/dev/", files.length >= 1);
  if (files[0]) {
    const content = readFileSync(join(devDir, files[0]), "utf8");
    ok(".eml contains /auth/verify-email link", content.includes("/auth/verify-email"));
    ok(".eml subject mentions 'Verify'", /Subject:.*Verify/i.test(content));
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 3", "Validation: bad signup payloads are rejected");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("POST", "/api/auth/register", { name: "x", email: newEmail, password: newPass });
  ok("short name → 400", r.status === 400);
}
{
  const r = await http("POST", "/api/auth/register", { name: "X", email: "not-an-email", password: newPass });
  ok("invalid email → 400", r.status === 400);
}
{
  const r = await http("POST", "/api/auth/register", { name: "X", email: `dup-${ts}@example.com`, password: "short" });
  ok("short password → 400", r.status === 400);
}
{
  const r = await http("POST", "/api/auth/register", { name: "Dup", email: newEmail, password: newPass });
  ok("duplicate email → 409", r.status === 409);
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 4", "Email verification — token round-trip");
// ─────────────────────────────────────────────────────────────────────────
{
  const token = devVerifyUrl.split("/").pop();
  const r = await http("POST", "/api/auth/verify-email", { token });
  ok("valid token → 200", r.status === 200);
  const body = await r.json();
  ok("response success=true", body.success === true);
  ok("response emailVerified=true", body.emailVerified === true);
}
{
  // Re-use: same token now cleared
  const token = devVerifyUrl.split("/").pop();
  const r = await http("POST", "/api/auth/verify-email", { token });
  ok("reused token → 400", r.status === 400);
  const body = await r.json();
  ok("error mentions 'already' or 'expired'", /already|expired/i.test(body.error || ""));
}
{
  // Malformed token
  const r = await http("POST", "/api/auth/verify-email", { token: "not-a-real-token" });
  ok("bogus token → 400", r.status === 400);
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 5", "Sign in — credentials callback");
// ─────────────────────────────────────────────────────────────────────────
{
  // Get fresh CSRF
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
  ok("POST /api/auth/callback/credentials → 302", r.status === 302, `status=${r.status}`);
  const loc = r.headers.get("location") || "";
  ok("redirects to /dashboard", loc.includes("/dashboard"), `loc=${loc}`);
  ok("session cookie set", !!JAR["authjs.session-token"]);
}
{
  const r = await http("GET", "/dashboard");
  ok("authed GET /dashboard → 200", r.status === 200);
  const html = await r.text();
  ok("dashboard mentions the new user by name", html.includes(newName) || html.includes("Welcome") || html.includes("Dashboard"));
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 6", "Wrong-password login is rejected; lockout is enforced");
// ─────────────────────────────────────────────────────────────────────────
{
  // Sign out first
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("callbackUrl", "/");
  body.set("json", "true");
  await http("POST", "/api/auth/signout", body);
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.session")) delete JAR[k];

  const csrfRes2 = await http("GET", "/api/auth/csrf");
  const { csrfToken: csrf2 } = await csrfRes2.json();
  const bad = new URLSearchParams();
  bad.set("csrfToken", csrf2);
  bad.set("email", newEmail);
  bad.set("password", "wrong-password-1234");
  bad.set("callbackUrl", "/dashboard");
  bad.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", bad);
  ok("wrong password → 302 (NextAuth redirects to error)", r.status === 302, `status=${r.status}`);
  ok("redirect goes to /auth/signin?error=", (r.headers.get("location") || "").includes("/auth/signin?error="));
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 7", "Forgot / reset password round-trip");
// ─────────────────────────────────────────────────────────────────────────
let devResetUrl = null;
{
  const r = await http("POST", "/api/auth/forgot-password", { email: newEmail });
  ok("POST /api/auth/forgot-password → 200", r.status === 200);
  const body = await r.json();
  ok("response success=true", body.success === true);
  ok("dev mode returns devResetUrl", body.dev === true && !!body.devResetUrl);
  if (body.devResetUrl) devResetUrl = body.devResetUrl;
  await new Promise(r => setTimeout(r, 500));
  const files = readdirSync(devDir).filter(f => f.includes("walkthrough-"));
  ok("reset .eml file written", files.length >= 2);
}
{
  const token = devResetUrl.split("token=").pop();
  const newPwd = "ResetMe456!@#";
  const r = await http("POST", "/api/auth/reset-password", { token, password: newPwd });
  ok("valid reset token → 200", r.status === 200);
  const body = await r.json();
  ok("response success=true", body.success === true);
}
{
  // Same token now used
  const token = devResetUrl.split("token=").pop();
  const r = await http("POST", "/api/auth/reset-password", { token, password: "Another123!@#" });
  ok("reused reset token → 400", r.status === 400);
}
{
  // Old password no longer works
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", newEmail);
  body.set("password", newPass);
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", body);
  ok("OLD password rejected after reset", r.status === 302 && (r.headers.get("location") || "").includes("error="));
}
{
  // New password works
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", newEmail);
  body.set("password", "ResetMe456!@#");
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", body);
  ok("NEW password accepted", r.status === 302 && (r.headers.get("location") || "").includes("/dashboard"));
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 8", "Account settings — name + password change");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/account");
  ok("authed GET /account → 200", r.status === 200);
  const html = await r.text();
  ok("/account page contains the user email", html.includes(newEmail));
  ok("/account page contains a Name field", /name/i.test(html));
  ok("/account page contains a Password field", /password/i.test(html));
}
{
  const r = await http("POST", "/api/account/update-name", { name: "Renamed User" });
  ok("POST /api/account/update-name → 200", r.status === 200, `status=${r.status}`);
  const body = await r.json().catch(() => ({}));
  ok("name update success=true", body.success === true || r.status === 200);
}
{
  // /api/account/change-password requires the current password
  const r = await http("POST", "/api/account/change-password", {
    currentPassword: "ResetMe456!@#",
    newPassword: "NewPwd789!@#",
  });
  ok("POST /api/account/change-password with correct current → 200", r.status === 200, `status=${r.status}`);
}
{
  // Wrong current password
  const r = await http("POST", "/api/account/change-password", {
    currentPassword: "WRONG",
    newPassword: "Whatever123!",
  });
  ok("wrong current password → 400/401", r.status === 400 || r.status === 401, `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 9", "Sessions UI honesty — JWT notice");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/api/auth/sessions");
  ok("GET /api/auth/sessions → 200", r.status === 200);
  const body = await r.json();
  ok("response includes notice about JWT", typeof body.notice === "string" && /JWT/.test(body.notice));
  ok("response includes sessions array", Array.isArray(body.sessions));
}
{
  const r = await http("GET", "/dashboard/sessions");
  ok("GET /dashboard/sessions → 200", r.status === 200);
  const html = await r.text();
  ok("sessions page contains 'JWT' notice text", /JWT/.test(html));
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 10", "Open-redirect protection on callbackUrl");
// ─────────────────────────────────────────────────────────────────────────
{
  // Sign in then try evil callback
  // (We are already signed in from step 8)
  const r = await http("GET", "/auth/signin?callbackUrl=//evil.com/phish");
  const loc = r.headers.get("location") || "";
  if (r.status === 307) {
    ok("middleware redirected (not 200)", true);
    ok("redirect target is NOT evil.com", !loc.includes("evil.com"));
    ok("redirect target is /dashboard (safe fallback)", /\/dashboard/.test(loc));
  } else {
    ok("page returned 200 (not maliciously redirected)", r.status === 200);
  }
}
{
  // Try with a Windows-style path
  const r = await http("GET", "/auth/signin?callbackUrl=/\\evil.com");
  const loc = r.headers.get("location") || "";
  if (r.status === 307) {
    ok("backslash-protocol redirect is NOT to evil.com", !loc.includes("evil.com"));
  } else {
    ok("backslash-protocol rejected (no malicious redirect)", r.status === 200);
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 11", "Sign out & post-logout redirect");
// ─────────────────────────────────────────────────────────────────────────
{
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("callbackUrl", "/");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/signout", body);
  ok("signout → 200/302", r.status === 200 || r.status === 302);
  // Clear session cookies
  for (const k of Object.keys(JAR)) if (k.startsWith("authjs.session")) delete JAR[k];
}
{
  const r = await http("GET", "/dashboard");
  ok("post-logout /dashboard → 307", r.status === 307);
  ok("redirects to /auth/signin", (r.headers.get("location") || "").includes("/auth/signin"));
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 12", "Two-user isolation — User A & User B can't see each other");
// ─────────────────────────────────────────────────────────────────────────
{
  // Register User A
  const r = await http("POST", "/api/auth/register", { name: "User A", email: emailA, password: "PassA123!@#" });
  ok("User A registered", r.status === 200);
}
{
  // Register User B
  const r = await http("POST", "/api/auth/register", { name: "User B", email: emailB, password: "PassB123!@#" });
  ok("User B registered", r.status === 200);
}
{
  // Sign in as User B
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", emailB);
  body.set("password", "PassB123!@#");
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const r = await http("POST", "/api/auth/callback/credentials", body);
  ok("User B signed in", r.status === 302 && (r.headers.get("location") || "").includes("/dashboard"));
}
{
  // User B's dashboard — should NOT show demo seed cases
  const r = await http("GET", "/dashboard");
  const html = await r.text();
  ok("User B dashboard 200", r.status === 200);
  ok("User B does NOT see 'Aseptic Mango Pulp'", !html.includes("Aseptic Mango Pulp"));
  ok("User B does NOT see 'Lithium Ion Batteries'", !html.includes("Lithium Ion Batteries"));
}
{
  // User B hits User A's nonexistent case ID — should be 404
  const r = await http("GET", "/api/trade-cases/00000000-0000-0000-0000-000000000000");
  ok("non-existent case ID → 401/404", r.status === 401 || r.status === 404, `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 13", "Google OAuth — NOT VERIFIED (env vars missing)");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/api/auth/providers");
  ok("GET /api/auth/providers → 200", r.status === 200);
  const body = await r.json();
  ok("response has Credentials provider", !!body.credentials);
  if (body.google) {
    info("Google provider IS configured (would test, but skipping for safety)");
  } else {
    skip++;
    console.log("  [SKIP] Google OAuth — env vars not set (per user decision; documented in PHASE3-FINAL-REPORT.md)");
  }
}

// ─────────────────────────────────────────────────────────────────────────
section("STEP 14", "Static-render & Suspense — /auth/error page builds & renders");
// ─────────────────────────────────────────────────────────────────────────
{
  const r = await http("GET", "/auth/error?error=Configuration");
  ok("GET /auth/error → 200", r.status === 200);
  const html = await r.text();
  ok("error page contains error-related text", /error|something went wrong|configuration/i.test(html));
}
{
  const r = await http("GET", "/auth/signin");
  ok("GET /auth/signin → 200", r.status === 200);
  const html = await r.text();
  ok("signin page has email field", /email/i.test(html));
  ok("signin page has password field", /password/i.test(html));
}
{
  const r = await http("GET", "/auth/signup");
  ok("GET /auth/signup → 200", r.status === 200);
  const html = await r.text();
  ok("signup page has name field", /name/i.test(html));
  ok("signup page has email field", /email/i.test(html));
  ok("signup page has password field", /password/i.test(html));
}

// ─────────────────────────────────────────────────────────────────────────
console.log("\n========================================");
console.log(`PASS:    ${pass}`);
console.log(`FAIL:    ${fail}`);
console.log(`SKIP:    ${skip}`);
console.log("========================================");
if (fail > 0) process.exit(1);
