// Phase 4 — live regression: verify all the new endpoints and rendering.
import { readFileSync } from "fs";

const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { console.log(`  [PASS] ${name}`); pass++; }
  else { console.log(`  [FAIL] ${name}${info ? " -- " + info : ""}`); fail++; }
}
function info(msg) { console.log(`  [INFO] ${msg}`); }

const cookiesFile = process.argv[2];
if (!cookiesFile) {
  console.error("Usage: node verify-phase4.mjs <cookies-file>");
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

function buildHeaders() {
  const h = new Headers();
  h.append("Cookie", cookies.map(([k, v]) => `${k}=${v}`).join("; "));
  return h;
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: buildHeaders(), redirect: "manual" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

async function main() {
  console.log("\n=== PHASE 4 LIVE REGRESSION ===\n");

  // 1. Dashboard
  {
    const r = await get("/dashboard");
    ok("Dashboard renders 200", r.status === 200);
    const cases = [...r.body.matchAll(/\/cases\/([a-f0-9-]{36})/g)].map((m) => m[1]);
    const uniq = Array.from(new Set(cases));
    info(`Found ${uniq.length} unique case IDs`);
    global.caseIds = uniq;
  }

  // 2. Documents list page (filter bar visible when ≥3 docs)
  {
    const caseId = global.caseIds[0];
    const r = await get(`/cases/${caseId}/documents`);
    ok("Documents page 200", r.status === 200, `status=${r.status}`);
    ok("Has Sort select", r.body.includes("Newest first"));
    ok("Has Status filter chips", r.body.includes('"All"') || r.body.includes("All"));
    const docIds = [...r.body.matchAll(/\/cases\/[a-f0-9-]{36}\/documents\/([a-f0-9-]{36})/g)].map((m) => m[1]);
    const uniqDocs = Array.from(new Set(docIds));
    info(`Found ${uniqDocs.length} unique doc IDs`);
    global.docIds = uniqDocs;
  }

  // 3. Document detail page
  {
    const caseId = global.caseIds[0];
    const docId = global.docIds[0];
    if (!docId) {
      ok("Document detail page renders", false, "no docId");
    } else {
      const r = await get(`/cases/${caseId}/documents/${docId}`);
      ok("Document detail 200", r.status === 200, `status=${r.status}`);
      ok("Detail has breadcrumb 'Documents' link", r.body.includes(`/cases/${caseId}/documents`));
      ok("Detail has 'Document type' label", r.body.includes("Document type"));
      ok("Detail has 'File size' label", r.body.includes("File size"));
      ok("Detail has 'MIME type' label", r.body.includes("MIME type"));
      ok("Detail has 'Evidence items' label", r.body.includes("Evidence items"));
      ok("Detail has 'Processing status' label", r.body.includes("Processing status"));
      ok("Detail has 'Document preview' label", r.body.includes("Document preview"));
      ok("Detail has 'Back to Documents' link", r.body.includes("Back to Documents"));
      ok("Detail has 'Requirements referencing'", r.body.includes("Requirements referencing"));
    }
  }

  // 4. Requirements page with ?documentId= filter
  {
    const caseId = global.caseIds[0];
    const docId = global.docIds[0];
    if (docId) {
      const r = await get(`/cases/${caseId}/requirements?documentId=${docId}`);
      ok("Requirements 200 with filter", r.status === 200, `status=${r.status}`);
      const hasFilter =
        r.body.includes("Showing requirements that reference this document") ||
        r.body.includes("No requirements currently reference this document") ||
        r.body.includes("Clear filter");
      ok("Requirements shows filter banner", hasFilter);
    }
  }

  // 5. Requirements page without filter (baseline)
  {
    const caseId = global.caseIds[0];
    const r = await get(`/cases/${caseId}/requirements`);
    ok("Requirements 200 baseline", r.status === 200);
    ok("Requirements has Add Requirement", r.body.includes("Add Requirement"));
  }

  // 6. Document detail for second case
  {
    const caseId = global.caseIds[1];
    if (caseId) {
      const r = await get(`/cases/${caseId}/documents`);
      ok("Second case documents 200", r.status === 200, `status=${r.status}`);
      const docIds = [...r.body.matchAll(/\/cases\/[a-f0-9-]{36}\/documents\/([a-f0-9-]{36})/g)].map((m) => m[1]);
      const uniq = Array.from(new Set(docIds));
      info(`Second case has ${uniq.length} docs`);
      if (uniq[0]) {
        const d = await get(`/cases/${caseId}/documents/${uniq[0]}`);
        ok("Second case detail 200", d.status === 200);
      }
    }
  }

  // 7. Document detail 404 for invalid ID
  {
    const caseId = global.caseIds[0];
    const r = await get(`/cases/${caseId}/documents/00000000-0000-0000-0000-000000000000`);
    const isNotFound =
      r.status === 404 ||
      r.status === 307 ||
      (r.status === 200 && (r.body.includes("404") || r.body.includes("not found") || r.body.includes("Not Found")));
    ok("Bogus doc ID returns 404/redirect or not-found page", isNotFound, `status=${r.status}`);
  }

  console.log("\n========================================");
  console.log(`PASS:    ${pass}`);
  console.log(`FAIL:    ${fail}`);
  console.log("========================================");
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
