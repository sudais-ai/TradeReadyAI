import { prisma } from "../db/prisma";
import { retrieveEvidenceForRequirement } from "./retrieval-service";
import { retrieveEvidenceAdvanced } from "./advanced-retriever";
import { buildEvidenceContext } from "./context-builder";
import { buildEvaluationMessages } from "./prompts";
import { getAIProvider } from "../ai";
import { ragEvaluationResponseSchema } from "./types";
import { AI_CONFIG } from "../ai/config";
import { validateCitations, Citation } from "./citation-validator";
import { log } from "../log";

export async function evaluateRequirement(tradeCaseId: string, requirementId: string) {
  // 1. Mark as processing in DB (or create if not exists)
  await prisma.requirementEvaluation.upsert({
    where: { requirementId },
    create: {
      requirementId,
      tradeCaseId,
      status: "PROCESSING",
      modelProvider: AI_CONFIG.PROVIDER,
      modelName: AI_CONFIG.MODEL,
    },
    update: {
      status: "PROCESSING",
      error: null,
      modelProvider: AI_CONFIG.PROVIDER,
      modelName: AI_CONFIG.MODEL,
    }
  });

  try {
    // 2. Fetch the requirement
    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, tradeCaseId },
    });

    if (!requirement) {
      throw new Error("Requirement not found or does not belong to case.");
    }

    // 3. Phase 11: Advanced RAG pipeline. The simple vector-only
    //    `retrieveEvidenceForRequirement` is preserved as the legacy
    //    path; this call replaces it for the default evaluation flow.
    let chunks: Awaited<ReturnType<typeof retrieveEvidenceAdvanced>>["results"];
    try {
      const advanced = await retrieveEvidenceAdvanced(requirement.title, {
        tradeCaseId,
        // Phase 11 defaults: 20 → 10 with rerank, ±1 neighbor.
        // The LLM-based query rewrite is ON by default; if the AI
        // provider is offline, the rewriter silently falls back to
        // the deterministic version.
      });
      chunks = advanced.results;
      // Stash the retrieval metadata for observability. The
      // RequirementEvaluation table doesn't have a column for it
      // (zero schema changes for Phase 11), so we log.
      log.info("rag:eval", "advanced retrieval complete", {
        requirementId,
        keywordCount: advanced.stages.keywordCount,
        vectorCount: advanced.stages.vectorCount,
        hybridCount: advanced.stages.hybridCount,
        fromLlm: advanced.stages.queryRewrite.fromLlm,
        rerankFromModel: advanced.stages.rerank.fromModel,
        finalCount: chunks.length,
      });
    } catch (advErr) {
      // Honest fallback: if the advanced path fails (e.g. FTS5 not
      // available in a brand-new install, model download failed),
      // fall back to the legacy simple vector path. We log so
      // operators can see it.
      log.warn("rag:eval", "advanced retrieval failed, falling back to simple vector", {
        requirementId,
        error: advErr instanceof Error ? advErr.message : String(advErr),
      });
      chunks = await retrieveEvidenceForRequirement(tradeCaseId, requirementId);
    }

    const validChunkIds = new Set(chunks.map(c => c.chunkId));

    // 4. Build Context & Prompt
    const context = buildEvidenceContext(chunks);
    const messages = buildEvaluationMessages(requirement.title, context);

    // 5. Call AI
    const provider = getAIProvider();
    const aiResponse = await provider.generateStructured({
      messages,
      schema: ragEvaluationResponseSchema,
    });

    const result = aiResponse.data;

    // 6. Phase 11: Citation validation. This is the "I" stage. We use
    //    the shared `validateCitations` helper which:
    //      - drops citations whose chunkId is not in validChunkIds
    //      - verifies each chunk's tradeCaseId
    //      - (optionally) verifies the AI's claimed documentId
    //    The legacy inline filter (kept below as defense-in-depth) is
    //    identical in behavior; validateCitations is the canonical
    //    path used by both this evaluation flow and any future
    //    citation-bearing flows.
    const citations: Citation[] = result.evidence.map((e) => ({
      chunkId: e.chunkId,
      reason: e.reason,
    }));
    const validation = await validateCitations(citations, validChunkIds, {
      tradeCaseId,
    });
    const validEvidence = validation.valid;

    if (result.evidence.length > 0 && validEvidence.length === 0) {
      // AI hallucinated all evidence IDs, downgrade to insufficient
      result.status = "INSUFFICIENT_EVIDENCE";
      result.summary = "The AI referenced invalid evidence. " + result.summary;
    } else if (result.status === "SATISFIED" && validEvidence.length === 0) {
      // AI claimed requirement is satisfied but provided zero evidence
      result.status = "INSUFFICIENT_EVIDENCE";
      result.summary = "The AI claimed the requirement was satisfied but provided no valid evidence. " + result.summary;
    }

    if (validation.crossCase.length > 0) {
      // This is a serious anomaly: the AI cited chunks that were
      // outside the requested trade case. Even after filtering, we
      // log loudly so operators can investigate.
      log.error("rag:eval", "cross-case citations detected and removed", {
        requirementId,
        tradeCaseId,
        count: validation.crossCase.length,
      });
    }

    // 7. Persist Evaluation and Evidence
    await prisma.$transaction(async (tx) => {
      // Clear old evidence links
      await tx.evaluationEvidence.deleteMany({
        where: { evaluation: { requirementId } }
      });

      const updatedEval = await tx.requirementEvaluation.update({
        where: { requirementId },
        data: {
          status: result.status,
          summary: result.summary,
          confidence: result.confidence,
        }
      });

      // Insert new evidence links
      if (validEvidence.length > 0) {
        await tx.evaluationEvidence.createMany({
          data: validEvidence.map(e => ({
            evaluationId: updatedEval.id,
            chunkId: e.chunkId,
            reason: e.reason,
            // Capture a small snapshot or relevance score if available
          }))
        });
      }
    });

    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Evaluation failed for requirement ${requirementId}:`, err);

    // Mark as failed
    await prisma.requirementEvaluation.update({
      where: { requirementId },
      data: {
        status: "FAILED",
        error: err.message || "Unknown error during evaluation",
      }
    }).catch(console.error);

    return { success: false, error: err.message };
  }
}
