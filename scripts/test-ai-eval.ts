import { PrismaClient } from '@prisma/client';
import { evaluateRequirement } from '../src/lib/rag/evaluation-service';
import { processDocumentEmbeddings } from '../src/lib/embeddings/embedding-service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
  try {
    console.log("1. Creating Test User...");
    const user = await prisma.user.upsert({
      where: { email: "ai-test@example.com" },
      update: {},
      create: {
        email: "ai-test@example.com",
        name: "AI Test User",
      }
    });

    console.log("2. Creating Trade Case...");
    const tradeCase = await prisma.tradeCase.create({
      data: {
        userId: user.id,
        origin: "Japan",
        destination: "Germany",
        status: "DRAFT",
      }
    });

    console.log("3. Creating Requirement...");
    const req = await prisma.requirement.create({
      data: {
        tradeCaseId: tradeCase.id,
        title: "Dual-use export license",
      }
    });

    console.log("4. Creating Document and Chunk...");
    const content = fs.readFileSync(path.join("C:\\Users\\Hp\\.gemini\\antigravity-ide\\brain\\3727a8a5-8b23-4888-a89f-6ff6561b86b7\\scratch\\test_document_1.txt"), "utf8");
    
    const doc = await prisma.document.create({
      data: {
        tradeCaseId: tradeCase.id,
        name: "test_document_1.txt",
        mimeType: "text/plain",
        size: content.length,
        status: "PROCESSING",
        embeddingStatus: "PENDING",
      }
    });

    const chunk = await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        content: content,
        chunkIndex: 0,
        characterCount: content.length,
      }
    });

    console.log("5. Processing Embeddings and FTS5 Sync...");
    await processDocumentEmbeddings(doc.id);

    console.log("6. Running AI Evaluation (Live Verification)...");
    const result = await evaluateRequirement(tradeCase.id, req.id);
    console.log("Evaluation Service Result:", result);

    console.log("7. Fetching Final DB State...");
    const evalResult = await prisma.requirementEvaluation.findUnique({
      where: { requirementId: req.id },
      include: {
        evidences: {
          include: {
            chunk: true,
          }
        }
      }
    });

    console.log("\n==============================");
    console.log("LIVE AI EVALUATION RESULT:");
    console.log("Status:", evalResult?.status);
    console.log("Summary:", evalResult?.summary);
    console.log("Confidence:", evalResult?.confidence);
    console.log("Model:", evalResult?.modelName, "via", evalResult?.modelProvider);
    console.log("Error:", evalResult?.error);
    console.log("Evidence Citations:", evalResult?.evidences.length);
    evalResult?.evidences.forEach((e, idx) => {
      console.log(`\n  Citation [${idx + 1}]:`);
      console.log(`    Chunk ID: ${e.chunkId}`);
      console.log(`    Reason: ${e.reason}`);
      console.log(`    Source Content Snippet: ${e.chunk.content.substring(0, 100).replace(/\n/g, " ")}...`);
    });
    console.log("==============================\n");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
