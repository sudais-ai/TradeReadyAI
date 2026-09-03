import { generateChunks, ChunkConfig } from "../src/lib/document-processing/chunking-service";
import assert from "assert";

console.log("==========================================");
console.log("VERIFYING PHASE 2 PART 7: CHUNKING SERVICE");
console.log("==========================================");

const testConfig: ChunkConfig = {
  targetChunkSize: 100,
  minChunkSize: 20,
  overlapSize: 20,
};

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name} passed`);
  } catch (error) {
    console.error(`❌ ${name} FAILED`);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runTest("Empty text returns empty chunks", () => {
  const chunks = generateChunks("", testConfig);
  assert.strictEqual(chunks.length, 0);
  
  const chunks2 = generateChunks("   ", testConfig);
  assert.strictEqual(chunks2.length, 0);
});

runTest("Small text fits in one chunk", () => {
  const text = "This is a small document.\n\nIt only has two lines.";
  const chunks = generateChunks(text, testConfig);
  
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].content, text);
  assert.strictEqual(chunks[0].index, 0);
  assert.strictEqual(chunks[0].characterCount, text.length);
});

runTest("Large text splits into multiple chunks with overlap", () => {
  // Each paragraph is ~45 chars
  const p1 = "This is the first paragraph. It has some text."; 
  const p2 = "This is the second paragraph. Also some text.";
  const p3 = "This is the third paragraph. A bit more text.";
  const p4 = "This is the fourth paragraph. Final one here.";
  
  const text = `${p1}\n\n${p2}\n\n${p3}\n\n${p4}`;
  const chunks = generateChunks(text, testConfig);
  
  // With targetChunkSize=100, each paragraph is ~46 chars.
  // p1+\n\n+p2 = ~94 chars (fits), adding p3 overflows → multiple chunks expected.
  assert.ok(chunks.length > 1, `Expected >1 chunks, got ${chunks.length}`);
  
  // Every paragraph must appear in at least one chunk
  const allContent = chunks.map(c => c.content).join(" ");
  assert.ok(allContent.includes(p3), "p3 should appear in chunks");
  assert.ok(allContent.includes(p4), "p4 should appear in chunks");
  
  // Chunk 0 must start with p1 (no overlap on first chunk)
  assert.ok(chunks[0].content.startsWith(p1), "Chunk 0 should start with p1");
  
  // Overlap: later chunks should reuse some text from the prior chunk
  // i.e. chunk[1] should contain a tail fragment from chunk[0]'s content
  const chunk0Tail = chunks[0].content.slice(-15);
  assert.ok(
    chunks[1].content.includes(chunk0Tail.trim()),
    "Chunk 1 should contain overlap text from Chunk 0"
  );
  
  // All indexes must be sequential
  chunks.forEach((c, i) => {
    assert.strictEqual(c.index, i, `Chunk index should be ${i}`);
  });
  
  // Character counts must match content
  chunks.forEach(c => {
    assert.strictEqual(c.characterCount, c.content.length);
  });
});

console.log("\n==========================================");
console.log("✅ All chunking logic tests passed.");
console.log("==========================================");
