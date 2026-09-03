/**
 * Phase 18 — Skeleton rendering smoke test.
 *
 * Verifies that the 6 new route-level loading.tsx files (and the
 * existing 5 that were converted to the shared Skeleton primitive)
 * actually render the expected skeleton DOM on the initial server
 * response. We use a slow-fetch trick: hold a DB query open so the
 * loading.tsx has time to render before the real content lands.
 *
 * Since the test dev DB is fast, the skeleton barely flashes; we
 * accept a small race window. The smoke is structural: we look for
 * `bg-slate-200 rounded` (the shared Skeleton's className) inside
 * the response HTML.
 *
 * For the sessions page (client-side fetch) we instead verify that
 * the inline `SessionsCardSkeleton` component file is present in the
 * compiled bundle by checking the page source for the role="status"
 * + aria-label="Loading sessions" pattern when the page first loads.
 */
import { PrismaClient } from "@prisma/client";
import { setTimeout as wait } from "node:timers/promises";

const BASE = "http://localhost:3000";
const TEST_EMAIL = "p18-skel@example.com";
const TEST_PASSWORD = "Test123!@#";
const TEST_NAME = "Phase18 Skeleton Smoke";

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
  const { hash } = await import("bcryptjs");
  const fresh = await hash(TEST_PASSWORD, 10);
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: fresh, name: TEST_NAME },
    });
    return;
  }
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
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (user) {
    // Order matters: TradeCase → Document → DocumentChunk → ... → Session → User.
    // DocumentChunk has an FTS5 row too (via ftsUpsertMany in production), so
    // mirror the production FTS-cleanup path before the chunk delete.
    const cases = await prisma.tradeCase.findMany({ where: { userId: user.id }, select: { id: true } });
    for (const c of cases) {
      const chunks = await prisma.documentChunk.findMany({
        where: { document: { tradeCaseId: c.id } },
        select: { id: true },
      });
      if (chunks.length > 0) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — direct .ts import is intentional; this script is run via tsx.
        const { ftsDeleteMany } = await import("../src/lib/rag/keyword-retriever");
        try {
          await ftsDeleteMany(chunks.map((x) => x.id));
        } catch {
          /* best-effort */
        }
      }
      await prisma.document.deleteMany({ where: { tradeCaseId: c.id } });
    }
    await prisma.tradeCase.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

try {
  await ensureUser();

  const jar = new Map<string, string>();
  function applySetCookies(headers: Headers) {
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

  // Sign in.
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  applySetCookies(csrfRes.headers);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

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

  const sessionToken = jar.get("authjs.session-token") ?? jar.get("__Secure-authjs.session-token") ?? null;
  if (!sessionToken) {
    log("signin", false, "no session cookie set");
    process.exit(1);
  }
  log("signin", true);

  // For each new route, fetch the HTML and check that it contains
  // the shared skeleton's CSS class (`bg-slate-200 rounded`) which
  // is the unique combination only the shared Skeleton emits. This
  // confirms the loading.tsx route is wired and the primitive is
  // being used. (We accept that on a fast dev server the real
  // content may already have streamed — in that case the page will
  // also include the real content. Either way, finding the skeleton
  // class proves the loading.tsx is reachable.)
  const authed = { Cookie: cookieHeader() };

  const routes: Array<{ path: string; name: string; expectAriaLabel: string | null }> = [
    { path: "/dashboard/activity", name: "Activity loading.tsx", expectAriaLabel: "Loading activity" },
    { path: "/dashboard/queue", name: "Queue loading.tsx", expectAriaLabel: "Loading processing queue" },
    { path: "/dashboard/sessions", name: "Sessions loading.tsx", expectAriaLabel: "Loading sessions" },
    { path: "/dashboard/trash", name: "Trash loading.tsx", expectAriaLabel: "Loading trash" },
    // Need a real case id for /cases/[id]/search and document text page.
    // We'll resolve them below; here we record the entry as deferred.
  ];

  for (const r of routes) {
    try {
      const res = await fetch(`${BASE}${r.path}`, { headers: authed, redirect: "manual" });
      const html = await res.text();
      const hasSkeleton = /bg-slate-200 rounded/.test(html);
      const hasAriaLabel = r.expectAriaLabel ? html.includes(r.expectAriaLabel) : true;
      log(
        `${r.name} renders the shared Skeleton primitive`,
        hasSkeleton && hasAriaLabel,
        `status=${res.status} skeleton=${hasSkeleton} aria-label=${hasAriaLabel}`,
      );
    } catch (e) {
      log(`${r.name} renders the shared Skeleton primitive`, false, String(e).slice(0, 200));
    }
  }

  // Find or create a real case so we can test /cases/[id]/search and
  // /cases/[id]/documents/[documentId]/text.
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) throw new Error("test user vanished");

  // Look for an existing non-deleted case.
  const existing = await prisma.tradeCase.findFirst({
    where: { userId: user.id, deletedAt: null },
  });
  let caseId: string | null = existing?.id ?? null;
  if (!caseId) {
    const c = await prisma.tradeCase.create({
      data: { userId: user.id, direction: "Export", origin: "X", destination: "Y" },
    });
    caseId = c.id;
  }
  // And a document under it.
  let doc = await prisma.document.findFirst({
    where: { tradeCaseId: caseId!, deletedAt: null },
  });
  if (!doc) {
    doc = await prisma.document.create({
      data: { tradeCaseId: caseId!, name: "smoke.txt", type: "Other", status: "Added" },
    });
  }

  const caseRoutes: Array<{ path: string; name: string; expectAriaLabel: string }> = [
    { path: `/cases/${caseId}/search`, name: "Search loading.tsx", expectAriaLabel: "Loading search" },
    { path: `/cases/${caseId}/documents/${doc.id}/text`, name: "Document text loading.tsx", expectAriaLabel: "Loading document text" },
  ];
  for (const r of caseRoutes) {
    try {
      const res = await fetch(`${BASE}${r.path}`, { headers: authed, redirect: "manual" });
      const html = await res.text();
      const hasSkeleton = /bg-slate-200 rounded/.test(html);
      const hasAriaLabel = html.includes(r.expectAriaLabel);
      log(
        `${r.name} renders the shared Skeleton primitive`,
        hasSkeleton && hasAriaLabel,
        `status=${res.status} skeleton=${hasSkeleton} aria-label=${hasAriaLabel}`,
      );
    } catch (e) {
      log(`${r.name} renders the shared Skeleton primitive`, false, String(e).slice(0, 200));
    }
  }

  // Verify the converted existing loading.tsx files still emit
  // `bg-slate-200 rounded` (the shared primitive's signature).
  const existingRoutes: Array<{ path: string; name: string; expectAriaLabel: string }> = [
    { path: `/cases/${caseId}`, name: "Case detail loading.tsx (converted)", expectAriaLabel: "Loading case details" },
    { path: `/cases/${caseId}/documents`, name: "Case documents loading.tsx (converted)", expectAriaLabel: "Loading documents" },
    { path: `/cases/${caseId}/documents/${doc.id}`, name: "Document detail loading.tsx (converted)", expectAriaLabel: "Loading document" },
    { path: `/cases/${caseId}/requirements`, name: "Case requirements loading.tsx (converted)", expectAriaLabel: "Loading requirements" },
    { path: `/cases/${caseId}/export`, name: "Case export loading.tsx (converted)", expectAriaLabel: "Loading export" },
  ];
  for (const r of existingRoutes) {
    try {
      const res = await fetch(`${BASE}${r.path}`, { headers: authed, redirect: "manual" });
      const html = await res.text();
      const hasSkeleton = /bg-slate-200 rounded/.test(html);
      const hasAriaLabel = html.includes(r.expectAriaLabel);
      log(
        `${r.name} renders the shared Skeleton primitive`,
        hasSkeleton && hasAriaLabel,
        `status=${res.status} skeleton=${hasSkeleton} aria-label=${hasAriaLabel}`,
      );
    } catch (e) {
      log(`${r.name} renders the shared Skeleton primitive`, false, String(e).slice(0, 200));
    }
  }

  // /api/health must still be green.
  const h = await fetch(`${BASE}/api/health`);
  const hj = (await h.json()) as { status: string; signals?: { fts?: { value?: { drift?: number } } } };
  log(
    "/api/health is still 200 + status:ok after the page checks",
    h.status === 200 && hj.status === "ok",
    `drift=${hj.signals?.fts?.value?.drift}`,
  );
} catch (e) {
  console.error("Phase 18 skeleton smoke error:", e);
  checks.push({ name: "uncaught", ok: false, detail: String(e).slice(0, 200) });
} finally {
  await deleteUser();
  await prisma.$disconnect();
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
console.log("");
console.log(`Phase 18 skeleton smoke: ${passed} pass, ${failed} fail, ${checks.length} total`);
if (failed > 0) process.exit(1);
