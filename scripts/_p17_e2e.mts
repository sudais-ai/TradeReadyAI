/**
 * Phase 17 end-to-end soft-nav verification.
 *
 * Flow:
 *  1. Fetch /api/auth/csrf to get a token.
 *  2. POST /api/auth/callback/credentials with the test user.
 *  3. The server returns 302 with Location → /dashboard (success).
 *  4. The browser would then call router.push(callbackUrl) — we can't
 *     test that from a Node fetch, but we CAN verify the server
 *     contract that backs the soft-nav:
 *       - 302 with Location: /dashboard = success, cookie is set.
 *       - The cookie is readable on the next request.
 *  5. GET /dashboard with the cookie — must be 200 (not 307).
 *  6. POST /api/auth/signout — should clear the session cookie.
 *  7. GET /dashboard without cookie — must be 307 to /auth/signin.
 */
import { PrismaClient } from "@prisma/client";
import { setTimeout as wait } from "node:timers/promises";

const BASE = "http://localhost:3000";
const TEST_EMAIL = "p17-e2e@example.com";
const TEST_PASSWORD = "Test123!@#";
const TEST_NAME = "Phase17 E2E";

const prisma = new PrismaClient();

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];

function log(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensureUser() {
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) {
    // Make sure the password matches
    const { hash } = await import("bcryptjs");
    const fresh = await hash(TEST_PASSWORD, 10);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: fresh, name: TEST_NAME },
    });
    return;
  }
  const { hash } = await import("bcryptjs");
  const fresh = await hash(TEST_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: TEST_NAME,
      passwordHash: fresh,
      emailVerified: new Date(),
    },
  });
}

async function deleteUser() {
  // Clean up any sessions first
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

try {
  await ensureUser();

  // Use a single jar (in-memory) so cookies persist across requests.
  const jar = new Map<string, string>();
  function applySetCookies(headers: Headers) {
    // Headers.getSetCookie() is the multi-cookie API in Node 20+
    const all = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const sc of all) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || value === "deleted") {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
  }
  function cookieHeader(): string {
    return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  // Step 1: CSRF — capture the CSRF cookie so it can be sent on the POST.
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  applySetCookies(csrfRes.headers);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  log("1. CSRF token obtained", typeof csrfToken === "string" && csrfToken.length > 0, `len=${csrfToken.length} jar=${jar.size} cookies`);

  // Step 2: POST credentials
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", TEST_EMAIL);
  body.set("password", TEST_PASSWORD);
  body.set("callbackUrl", "/dashboard");
  body.set("json", "true");

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: body.toString(),
    redirect: "manual",
  });
  applySetCookies(loginRes.headers);

  // Step 3: expect 302 to /dashboard
  const location = loginRes.headers.get("location") ?? "";
  log(
    "2. Login returns 302 with Location: /dashboard",
    loginRes.status === 302 && location.includes("/dashboard"),
    `status=${loginRes.status} location=${location}`,
  );

  // Step 4: session cookie is now in the jar
  const sessionToken = jar.get("authjs.session-token") ?? jar.get("__Secure-authjs.session-token") ?? null;
  log("3. Session cookie set on response", !!sessionToken, sessionToken ? `token len=${sessionToken.length}` : "no cookie in jar");

  // Step 5: GET /dashboard with the jar
  if (sessionToken) {
    const dashRes = await fetch(`${BASE}/dashboard`, {
      headers: { Cookie: cookieHeader() },
      redirect: "manual",
    });
    log(
      "4. /dashboard returns 200 with the session cookie (soft-nav target is reachable)",
      dashRes.status === 200,
      `status=${dashRes.status}`,
    );
  } else {
    log("4. /dashboard returns 200 with the session cookie (soft-nav target is reachable)", false, "no session token to test");
  }

  // Step 6: POST signout with the cookie
  if (sessionToken) {
    // Re-fetch CSRF for the signout form
    const csrfRes2 = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: cookieHeader() } });
    applySetCookies(csrfRes2.headers);
    const { csrfToken: csrf2 } = (await csrfRes2.json()) as { csrfToken: string };
    const signoutBody = new URLSearchParams();
    signoutBody.set("csrfToken", csrf2);
    signoutBody.set("callbackUrl", "/auth/signin");
    signoutBody.set("json", "true");
    const signoutRes = await fetch(`${BASE}/api/auth/signout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(),
      },
      body: signoutBody.toString(),
      redirect: "manual",
    });
    applySetCookies(signoutRes.headers);
    log(
      "5. /api/auth/signout responds (no 5xx)",
      signoutRes.status < 500,
      `status=${signoutRes.status}`,
    );

    // Step 7: GET /dashboard unauthed
    await wait(500);
    const dashNoCookie = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    log(
      "6. /dashboard unauthed returns 307 to /auth/signin",
      dashNoCookie.status === 307 && (dashNoCookie.headers.get("location") ?? "").includes("/auth/signin"),
      `status=${dashNoCookie.status} location=${dashNoCookie.headers.get("location") ?? ""}`,
    );
  }
} catch (e) {
  console.error("E2E error:", e);
  checks.push({ name: "uncaught", ok: false, detail: String(e).slice(0, 200) });
} finally {
  await deleteUser();
  await prisma.$disconnect();
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
console.log("");
console.log(`Phase 17 E2E: ${passed} pass, ${failed} fail, ${checks.length} total`);
if (failed > 0) process.exit(1);
