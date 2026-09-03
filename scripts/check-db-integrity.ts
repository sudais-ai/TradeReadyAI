import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const chunks = await prisma.documentChunk.count();
  const embeddings = await prisma.documentChunkEmbedding.count();
  const evals = await prisma.requirementEvaluation.count();
  const evidences = await prisma.evaluationEvidence.count();
  console.log("Database integrity check:");
  console.log("  DocumentChunks: " + chunks);
  console.log("  DocumentChunkEmbeddings: " + embeddings);
  console.log("  RequirementEvaluations: " + evals);
  console.log("  EvaluationEvidences: " + evidences);
}

main().finally(() => prisma.$disconnect());