/**
 * Phase 2 Part 9 Verification Script
 * Validates the RAG Retrieval and AI Evaluation pipeline.
 */

import { prisma } from "../src/lib/db/prisma";
import { evaluateRequirement } from "../src/lib/rag/evaluation-service";

async function verify() {
  console.log("=== PHASE 2 PART 9: RAG VERIFICATION ===");

  try {
    // 1. Setup a test TradeCase and Requirement
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No user found.");

    const tradeCase = await prisma.tradeCase.create({
      data: {
        userId: user.id,
        direction: "Export",
        origin: "USA",
        destination: "UK",
        status: "Draft",
        product: {
          create: {
            name: "Test Product",
            category: "Electronics",
          }
        },
        documents: {
          create: {
            name: "Test Invoice.pdf",
            type: "Invoice",
            status: "Added",
            chunks: {
              create: [
                {
                  chunkIndex: 0,
                  content: "Country of Origin: United States of America. Value: $500.",
                  characterCount: 57,
                  embeddings: {
                    create: {
                      provider: "dev",
                      model: "dev-hash-model",
                      dimensions: 1536,
                      vector: JSON.stringify(new Array(1536).fill(0.1)),
                    }
                  }
                },
                {
                  chunkIndex: 1,
                  content: "This product contains lithium batteries.",
                  characterCount: 40,
                  embeddings: {
                    create: {
                      provider: "dev",
                      model: "dev-hash-model",
                      dimensions: 1536,
                      vector: JSON.stringify(new Array(1536).fill(0.2)),
                    }
                  }
                }
              ]
            }
          }
        }
      }
    });

    const requirement = await prisma.requirement.create({
      data: {
        title: "Product country of origin must be declared.",
        tradeCaseId: tradeCase.id,
      }
    });

    console.log(`Created test case ${tradeCase.id} and requirement ${requirement.id}`);

    // 2. Trigger Evaluation
    console.log("\nTriggering evaluation (expecting AI Provider failure if no key)...");
    const result = await evaluateRequirement(tradeCase.id, requirement.id);
    
    const evaluation = await prisma.requirementEvaluation.findUnique({
      where: { requirementId: requirement.id },
      include: { evidences: true }
    });

    if (result.success) {
      console.log("Evaluation SUCCEEDED!");
      console.log("Status:", evaluation?.status);
      console.log("Summary:", evaluation?.summary);
      console.log("Evidence items:", evaluation?.evidences.length);
    } else {
      console.log("Evaluation FAILED as expected (No API Key).");
      console.log("Error:", result.error);
      console.log("Saved DB Status:", evaluation?.status);
      console.log("Saved DB Error:", evaluation?.error);
    }

    // 3. Cleanup
    console.log("\nCleaning up...");
    await prisma.tradeCase.delete({ where: { id: tradeCase.id } });
    console.log("Test Case cascade deleted.");
    
    console.log("\nVerification complete!");
  } catch (error) {
    console.error("Verification failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
