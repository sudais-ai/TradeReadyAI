// Phase 2 Part 1 — Server Action Validation Verification
// Tests: Zod validation, createTradeCase action, error handling

import { createTradeCaseSchema } from "../src/lib/validations/trade-case";

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

function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Validation & Error Handling Tests            ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── Valid input ──
  console.log("▶ Valid Input");
  const validInput = {
    productName: "Test Product",
    direction: "export" as const,
    origin: "Pakistan",
    destination: "United Kingdom",
    date: "2026-12-01",
    value: "$50,000",
    category: "Food",
    description: "Test description",
  };
  const validResult = createTradeCaseSchema.safeParse(validInput);
  assert("Valid input passes validation", validResult.success);

  // ── Valid input with optional fields omitted ──
  console.log("\n▶ Valid Input (minimal)");
  const minimalInput = {
    productName: "Minimal Product",
    direction: "import" as const,
    origin: "China",
    destination: "Germany",
  };
  const minimalResult = createTradeCaseSchema.safeParse(minimalInput);
  assert("Minimal valid input passes validation", minimalResult.success);

  // ── Missing required fields ──
  console.log("\n▶ Missing Required Fields");

  const noProductName = createTradeCaseSchema.safeParse({ direction: "export", origin: "A", destination: "B" });
  assert("Missing productName fails", !noProductName.success);

  const noDirection = createTradeCaseSchema.safeParse({ productName: "X", origin: "A", destination: "B" });
  assert("Missing direction fails", !noDirection.success);

  const noOrigin = createTradeCaseSchema.safeParse({ productName: "X", direction: "Export", destination: "B" });
  assert("Missing origin fails", !noOrigin.success);

  const noDestination = createTradeCaseSchema.safeParse({ productName: "X", direction: "Export", origin: "A" });
  assert("Missing destination fails", !noDestination.success);

  // ── Empty string required fields ──
  console.log("\n▶ Empty String Required Fields");

  const emptyProductName = createTradeCaseSchema.safeParse({ productName: "", direction: "export", origin: "A", destination: "B" });
  assert("Empty productName fails", !emptyProductName.success);

  const emptyOrigin = createTradeCaseSchema.safeParse({ productName: "X", direction: "export", origin: "", destination: "B" });
  assert("Empty origin fails", !emptyOrigin.success);

  const emptyDestination = createTradeCaseSchema.safeParse({ productName: "X", direction: "export", origin: "A", destination: "" });
  assert("Empty destination fails", !emptyDestination.success);

  // ── Invalid direction enum ──
  console.log("\n▶ Invalid Direction Enum");
  const badDirection = createTradeCaseSchema.safeParse({ productName: "X", direction: "invalid", origin: "A", destination: "B" });
  assert("Invalid direction enum fails", !badDirection.success);

  // ── Completely empty object ──
  console.log("\n▶ Empty Object");
  const emptyObj = createTradeCaseSchema.safeParse({});
  assert("Empty object fails validation", !emptyObj.success);

  // ── Null / undefined ──
  console.log("\n▶ Null/Undefined");
  const nullInput = createTradeCaseSchema.safeParse(null);
  assert("Null input fails", !nullInput.success);

  const undefinedInput = createTradeCaseSchema.safeParse(undefined);
  assert("Undefined input fails", !undefinedInput.success);

  // ── Wrong types ──
  console.log("\n▶ Wrong Types");
  const numericName = createTradeCaseSchema.safeParse({ productName: 12345, direction: "export", origin: "A", destination: "B" });
  assert("Numeric productName fails", !numericName.success);

  // SUMMARY
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed                  `);
  console.log("╚══════════════════════════════════════════════╝");
  if (failures.length > 0) {
    console.log("\nFailed tests:");
    failures.forEach((f) => console.log(`  ❌ ${f}`));
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main();
