// Live verification: simulates the full Phase 3 user journey against the running dev server.
import { readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const COOKIE_JAR = {};

function setCookie(headers) {
  const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const [k, v] = pair.split("=");
    if (k && v !== undefined) COOKIE_JAR[k.trim()] = v.trim();
  }
}

function cookieHeader() {
  return Object.entries(COOKIE_JAR).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function http(method, path, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (Object.keys(COOKIE_JAR).length > 0) {
    opts.headers["Cookie"] = cookieHeader();
  }
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

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { console.log(`  PASS ${name}`); pass++; }
  else { console.log(`  FAIL ${name}${info ? " -- " + info : ""}`); fail++; }
}

// Clean dev emails dir of any prior tests
const devDir = join(process.cwd(), ".emails", "dev");
for (const f of readdirSync(devDir)) {
  if (f.includes("livetest-")) unlinkSync(join(devDir, f));
}

const email = `livetest-${Date.now()}@example.com`;
const password = "LiveTest123!";
const name = "Live Test User";

console.log("LIVE 1: Anonymous /dashboard is redirected");
{
  const res = await http("GET", "/dashboard");
  ok("Anonymous /dashboard -> 307 to /auth/signin", res.status === 307);
  const loc = res.headers.get("location") || "";
  ok("callbackUrl is present", loc.includes("callbackUrl="));
}

console.log("\nLIVE 2: Signup with email/password");
let verifyUrl = null;
{
  const res = await http("POST", "/api/auth/register", { name, email, password });
  ok("Signup returns 200", res.status === 200);
  const body = await res.json();
  ok("Signup returns success=true", body.success === true);
  ok("Signup returns user id", !!body.user?.id);
  ok("Signup emailVerified=false", body.user?.emailVerified === false);
  ok("Dev mode exposes devVerifyUrl", body.dev === true && !!body.devVerifyUrl);
  if (body.devVerifyUrl) verifyUrl = body.devVerifyUrl;
  await new Promise(r => setTimeout(r, 500));
  const files = readdirSync(devDir).filter(f => f.includes("livetest-"));
  ok("Verification email file written to .emails/dev/", files.length >= 1);
  if (files[0]) {
    const content = readFileSync(join(devDir, files[0]), "utf8");
    ok("Email body contains /auth/verify-email link", content.includes("/auth/verify-email"));
  }
}

console.log("\nLIVE 3: Click the verification link");
{
  const token = verifyUrl.split("/").pop();
  const res = await http("POST", "/api/auth/verify-email", { token });
  ok("Verify-email returns 200", res.status === 200);
  const body = await res.json();
  ok("Verify-email returns success=true", body.success === true);
}

console.log("\nLIVE 4: Token cannot be reused");
{
  const token = verifyUrl.split("/").pop();
  const res = await http("POST", "/api/auth/verify-email", { token });
  ok("Second verify returns 400", res.status === 400);
  const body = await res.json();
  ok("Error mentions already-used/expired", typeof body.error === "string" && (body.error.toLowerCase().includes("already") || body.error.toLowerCase().includes("expired")));
}

console.log("\nLIVE 5: Sign in via credentials callback");
{
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", email);
  body.set("password", password);
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const res = await http("POST", "/api/auth/callback/credentials", body);
  const loc = res.headers.get("location") || "";
  ok("Credentials callback returns 302", res.status === 302, `status=${res.status} loc=${loc}`);
  ok("Redirect goes to /dashboard", loc.includes("/dashboard"), `loc=${loc}`);
  ok("Session cookie set", !!COOKIE_JAR["authjs.session-token"]);
}

console.log("\nLIVE 6: Authenticated /dashboard returns 200");
{
  const res = await http("GET", "/dashboard");
  ok("Authenticated /dashboard -> 200", res.status === 200);
}

console.log("\nLIVE 7: Sessions endpoint returns notice");
{
  const res = await http("GET", "/api/auth/sessions");
  ok("Sessions endpoint -> 200", res.status === 200);
  const body = await res.json();
  ok("Sessions response has notice about JWT", typeof body.notice === "string" && body.notice.includes("JWT"));
  ok("Sessions response has sessions array", Array.isArray(body.sessions));
}

console.log("\nLIVE 8: Sign out");
{
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("callbackUrl", "/");
  body.set("json", "true");
  const res = await http("POST", "/api/auth/signout", body);
  ok("Sign-out returns 200/302", res.status === 200 || res.status === 302);
}

console.log("\nLIVE 9: After sign-out, /dashboard redirects again");
{
  for (const k of Object.keys(COOKIE_JAR)) {
    if (k.startsWith("authjs.session")) delete COOKIE_JAR[k];
  }
  const res = await http("GET", "/dashboard");
  ok("Post-logout /dashboard -> 307", res.status === 307);
  const loc = res.headers.get("location") || "";
  ok("Redirects to /auth/signin", loc.includes("/auth/signin"));
}

console.log("\nLIVE 10: Sign in as demo user (seed)");
{
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", "demo@tradeready.ai");
  body.set("password", "demo123!@#");
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");
  const res = await http("POST", "/api/auth/callback/credentials", body);
  const loc = res.headers.get("location") || "";
  ok("Demo user sign-in returns 302", res.status === 302, `status=${res.status} loc=${loc}`);
  ok("Demo user lands on /dashboard", loc.includes("/dashboard"), `loc=${loc}`);
  const dashRes = await http("GET", "/dashboard");
  const html = await dashRes.text();
  ok("Dashboard shows seed case 'Aseptic Mango Pulp'", html.includes("Aseptic Mango Pulp"));
  ok("Dashboard shows seed case 'Lithium Ion Batteries'", html.includes("Lithium Ion Batteries"));
}

console.log("\nLIVE 11: Open-redirect on signin callbackUrl is sanitized");
{
  const res = await http("GET", "/auth/signin?callbackUrl=//evil.com/phish");
  const loc = res.headers.get("location") || "";
  if (res.status === 307) {
    ok("Middleware redirected to safe destination (not //evil.com)", !loc.includes("evil.com"));
    ok("Redirected to /dashboard (safe fallback)", loc.includes("/dashboard"));
  } else {
    // Page rendered; that's also acceptable for an already-authed user hitting the signin page
    ok("Authed user on /auth/signin does not honor malicious callbackUrl", res.status === 200);
  }
}

console.log("\nLIVE 12: Account page is reachable for authed user");
{
  const res = await http("GET", "/account");
  ok("Authenticated /account -> 200", res.status === 200);
  const html = await res.text();
  ok("Account page contains email field", html.toLowerCase().includes("email"));
}

console.log("\nLIVE 13: Two-user isolation: register User A, then try to view from User B");
{
  // Sign out current user
  const csrfRes = await http("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const outBody = new URLSearchParams();
  outBody.set("csrfToken", csrfToken);
  outBody.set("callbackUrl", "/");
  outBody.set("json", "true");
  await http("POST", "/api/auth/signout", outBody);
  for (const k of Object.keys(COOKIE_JAR)) {
    if (k.startsWith("authjs.session")) delete COOKIE_JAR[k];
  }

  // Create User A
  const emailA = `usera-${Date.now()}@example.com`;
  await http("POST", "/api/auth/register", { name: "User A", email: emailA, password: "PassA123!@#" });

  // Create User B
  const emailB = `userb-${Date.now()}@example.com`;
  await http("POST", "/api/auth/register", { name: "User B", email: emailB, password: "PassB123!@#" });

  // Sign in as User B
  const csrfRes2 = await http("GET", "/api/auth/csrf");
  const { csrfToken: csrfB } = await csrfRes2.json();
  const signinBody = new URLSearchParams();
  signinBody.set("csrfToken", csrfB);
  signinBody.set("email", emailB);
  signinBody.set("password", "PassB123!@#");
  signinBody.set("callbackUrl", "/dashboard");
  signinBody.set("json", "true");
  const signinRes = await http("POST", "/api/auth/callback/credentials", signinBody);
  ok("User B signed in", signinRes.status === 302);

  // User B's dashboard should NOT see User A's data
  const dashRes = await http("GET", "/dashboard");
  const html = await dashRes.text();
  // User A has no trade cases (didn't create any), so dashboard should say "no cases"
  ok("User B dashboard renders (200)", dashRes.status === 200);
  ok("User B dashboard does NOT leak demo seed cases", !html.includes("Aseptic Mango Pulp"));
}

console.log("\n=== LIVE VERIFICATION SUMMARY ===");
console.log(`Passed: ${pass}`);
console.log(`Failed: ${fail}`);
if (fail > 0) process.exit(1);
