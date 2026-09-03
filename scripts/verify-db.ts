// Phase 2 Part 1 — Comprehensive Verification Script
// Tests: DB connection, CRUD, validation, error handling, relationships

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
    failures.push(name);
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Phase 2 Part 1 — Full Verification Suite    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ──────────────────────────────────────────────────────────
  // 1. DATABASE CONNECTION
  // ──────────────────────────────────────────────────────────
  console.log("▶ 1. Database Connection");
  try {
    await prisma.$connect();
    assert("Prisma connects to SQLite", true);
  } catch (e: any) {
    assert("Prisma connects to SQLite", false, e.message);
  }

  // ──────────────────────────────────────────────────────────
  // 2. SEED DATA VERIFICATION
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 2. Seed Data Verification");
  const seedUsers = await prisma.user.findMany();
  assert("At least 1 user exists", seedUsers.length >= 1, `Found ${seedUsers.length}`);

  const allCases = await prisma.tradeCase.findMany({ include: { product: true, documents: true, requirements: true } });
  // Filter for only the seed cases (Mango and Battery)
  const seedCases = allCases.filter((tc) => 
    (tc.origin === "Pakistan" && tc.destination === "United Kingdom") ||
    (tc.origin === "China" && tc.destination === "Germany")
  );
  assert("At least 2 trade cases seeded", seedCases.length >= 2, `Found ${seedCases.length}`);

  for (const tc of seedCases) {
    assert(`Case "${tc.origin} → ${tc.destination}" has product`, tc.product !== null);
    assert(`Case "${tc.origin} → ${tc.destination}" has documents`, tc.documents.length > 0, `Found ${tc.documents.length}`);
    assert(`Case "${tc.origin} → ${tc.destination}" has requirements`, tc.requirements.length > 0, `Found ${tc.requirements.length}`);
    assert(`Case "${tc.origin} → ${tc.destination}" has valid status`, ["Draft", "In Progress", "Needs Information", "Ready for Review", "Reviewed"].includes(tc.status), `Status: ${tc.status}`);
    assert(`Case "${tc.origin} → ${tc.destination}" has valid direction`, ["export", "import"].includes(tc.direction), `Direction: ${tc.direction}`);
  }

  // ──────────────────────────────────────────────────────────
  // 3. TRADE CASE CREATE (CRUD — C)
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 3. Trade Case CREATE");
  const testUser = seedUsers[0];
  let createdCase: any;
  try {
    createdCase = await prisma.tradeCase.create({
      data: {
        origin: "TestOrigin",
        destination: "TestDestination",
        direction: "export",
        status: "Draft",
        shipmentDate: "2026-12-01",
        estimatedValue: "$10,000",
        userId: testUser.id,
        product: {
          create: {
            name: "Test Product",
            description: "A test product for verification",
            material: "Test Material",
            packaging: "Test Packaging",
            intendedUse: "Testing",
            origin: "TestOrigin",
            quantity: "100 units",
            weight: "50 kg",
          },
        },
        documents: {
          create: [
            { name: "Test Invoice", status: "Added", description: "Test invoice doc" },
            { name: "Test Packing List", status: "Missing", description: "Test packing doc" },
          ],
        },
        requirements: {
          create: [
            { title: "Test Requirement 1", status: "Needs review", source: "Test Source" },
            { title: "Test Requirement 2", status: "Confirmed", source: "Test Source 2" },
          ],
        },
      },
      include: { product: true, documents: true, requirements: true },
    });
    assert("Create trade case with nested relations", true);
    assert("Created case has UUID id", typeof createdCase.id === "string" && createdCase.id.length > 10);
    assert("Created case product attached", createdCase.product !== null && createdCase.product.name === "Test Product");
    assert("Created case has 2 documents", createdCase.documents.length === 2);
    assert("Created case has 2 requirements", createdCase.requirements.length === 2);
    assert("Created case has correct origin", createdCase.origin === "TestOrigin");
    assert("Created case has correct direction", createdCase.direction === "export");
    assert("Created case has timestamps", createdCase.createdAt instanceof Date && createdCase.updatedAt instanceof Date);
  } catch (e: any) {
    assert("Create trade case with nested relations", false, e.message);
  }

  // ──────────────────────────────────────────────────────────
  // 4. TRADE CASE READ (CRUD — R)
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 4. Trade Case READ");
  if (createdCase) {
    const fetched = await prisma.tradeCase.findUnique({
      where: { id: createdCase.id },
      include: { product: true, documents: true, requirements: true },
    });
    assert("Read trade case by ID", fetched !== null);
    assert("Read returns correct product name", fetched?.product?.name === "Test Product");
    assert("Read returns correct document count", fetched?.documents.length === 2);
    assert("Read returns correct requirement count", fetched?.requirements.length === 2);
  }

  // ──────────────────────────────────────────────────────────
  // 5. TRADE CASE LIST (CRUD — L)
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 5. Trade Case LIST");
  const listCases = await prisma.tradeCase.findMany({
    include: { product: true },
    orderBy: { updatedAt: "desc" },
  });
  assert("List returns all cases (seed + created)", listCases.length >= 3, `Found ${listCases.length}`);
  assert("List is ordered by updatedAt desc", listCases[0].updatedAt >= listCases[listCases.length - 1].updatedAt);

  // ──────────────────────────────────────────────────────────
  // 6. TRADE CASE UPDATE (CRUD — U)
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 6. Trade Case UPDATE");
  if (createdCase) {
    const updated = await prisma.tradeCase.update({
      where: { id: createdCase.id },
      data: {
        status: "In Progress",
        origin: "UpdatedOrigin",
      },
    });
    assert("Update trade case status", updated.status === "In Progress");
    assert("Update trade case origin", updated.origin === "UpdatedOrigin");
    assert("Update preserves other fields", updated.destination === "TestDestination");
  }

  // ──────────────────────────────────────────────────────────
  // 7. MISSING TRADE CASE HANDLING
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 7. Missing Trade Case Handling");
  const missingCase = await prisma.tradeCase.findUnique({
    where: { id: "non-existent-id-12345" },
  });
  assert("Non-existent case returns null", missingCase === null);

  // ──────────────────────────────────────────────────────────
  // 8. INVALID RELATIONSHIPS
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 8. Invalid Relationships");
  try {
    await prisma.tradeCase.create({
      data: {
        origin: "Bad",
        destination: "Case",
        direction: "Export",
        userId: "non-existent-user-id",
      },
    });
    assert("FK constraint blocks invalid userId", false, "Should have thrown");
  } catch (e: any) {
    assert("FK constraint blocks invalid userId", true);
  }

  try {
    if (createdCase) {
      await prisma.product.create({
        data: {
          name: "Duplicate Product",
          tradeCaseId: createdCase.id,
        },
      });
      assert("Unique constraint blocks duplicate product per case", false, "Should have thrown");
    }
  } catch (e: any) {
    assert("Unique constraint blocks duplicate product per case", true);
  }

  // ──────────────────────────────────────────────────────────
  // 9. CASCADE DELETE
  // ──────────────────────────────────────────────────────────
  console.log("\n▶ 9. Cascade Delete");
  if (createdCase) {
    await prisma.tradeCase.delete({ where: { id: createdCase.id } });
    const deletedProduct = await prisma.product.findUnique({ where: { id: createdCase.product.id } });
    const deletedDocs = await prisma.document.findMany({ where: { tradeCaseId: createdCase.id } });
    const deletedReqs = await prisma.requirement.findMany({ where: { tradeCaseId: createdCase.id } });
    assert("Cascade delete removes product", deletedProduct === null);
    assert("Cascade delete removes documents", deletedDocs.length === 0);
    assert("Cascade delete removes requirements", deletedReqs.length === 0);
  }

  // ──────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed                  `);
  console.log("╚══════════════════════════════════════════════╝");
  if (failures.length > 0) {
    console.log("\nFailed tests:");
    failures.forEach((f) => console.log(`  ❌ ${f}`));
  }
  console.log("");

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
