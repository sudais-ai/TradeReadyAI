"use server";

import { evaluateRequirement } from "@/lib/rag/evaluation-service";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { tryClaim, release } from "@/lib/util/inflight";
import {
  requireAuth,
  requireOwnedTradeCase,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";

/**
 * Triggers an AI evaluation for a single requirement.
 */
export async function triggerRequirementEvaluation(tradeCaseId: string, requirementId: string) {
  // Phase 16: server-side in-flight guard. The client UI already
  // disables the Analyze button while evaluating, but a network
  // retry or a script can re-send the action. Reject the duplicate
  // before we touch the database or the AI provider.
  const claimKey = `analyze:${tradeCaseId}:${requirementId}`;
  if (!tryClaim(claimKey)) {
    return { success: false, error: "An evaluation for this requirement is already in progress." };
  }

  try {
    // Security: enforce signed-in + ownership of the parent case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Basic authorization/ownership check
    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, tradeCaseId },
    });

    if (!requirement) {
      return { success: false, error: "Requirement not found." };
    }

    // Call the service (this runs the full RAG pipeline and persists the result)
    // We await it here so the client knows it finished, but in a real massive app
    // you might want to kick this off asynchronously or via a queue.
    const result = await evaluateRequirement(tradeCaseId, requirementId);

    // Revalidate the page so the new status appears
    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/requirements`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors
    }

    if (!result.success) {
      return { success: false, error: result.error || "Failed to evaluate requirement." };
    }

    return { success: true };
  } catch (error) {
    console.error("Evaluation action failed:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to evaluate requirements." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    return { success: false, error: "An unexpected error occurred during evaluation." };
  } finally {
    // Phase 16: always release the in-flight claim, even on error.
    release(claimKey);
  }
}

/**
 * Triggers evaluation for all requirements sequentially to avoid rate limits.
 */
export async function triggerAllRequirementsEvaluation(tradeCaseId: string) {
  // Phase 16: server-side in-flight guard for the bulk action. Same
  // rationale as the single-requirement path above.
  const claimKey = `analyze-all:${tradeCaseId}`;
  if (!tryClaim(claimKey)) {
    return { success: false, error: "An evaluation for this trade case is already in progress." };
  }

  try {
    // Security: enforce signed-in + ownership of the parent case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const requirements = await prisma.requirement.findMany({
      where: { tradeCaseId },
    });

    if (requirements.length === 0) {
      return { success: true, message: "No requirements to evaluate." };
    }

    // Process sequentially to be gentle on the API
    let successCount = 0;
    for (const req of requirements) {
      const res = await evaluateRequirement(tradeCaseId, req.id);
      if (res.success) {
        successCount++;
      }
    }

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/requirements`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation errors
    }

    if (successCount === 0) {
      return { success: false, error: "All evaluations failed." };
    }

    return { success: true, message: `Evaluated ${successCount}/${requirements.length} requirements.` };
  } catch (error) {
    console.error("Evaluate all action failed:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to evaluate requirements." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    return { success: false, error: "An unexpected error occurred." };
  } finally {
    // Phase 16: always release the in-flight claim, even on error.
    release(claimKey);
  }
}
