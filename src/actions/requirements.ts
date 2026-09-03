"use server";

import { prisma } from "@/lib/db/prisma";
import { createRequirementSchema, updateRequirementSchema } from "@/lib/validations/requirement";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  requireOwnedTradeCase,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";

// ─── Create Requirement ───────────────────────────────────────────────────────────

export async function createRequirement(tradeCaseId: string, formData: unknown) {
  try {
    // Security: must be signed in AND own the parent trade case.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const validatedData = createRequirementSchema.parse(formData);

    const req = await prisma.requirement.create({
      data: {
        tradeCaseId,
        title: validatedData.title,
        status: validatedData.status,
        source: validatedData.source || null,
      },
    });

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/requirements`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true, id: req.id };
  } catch (error) {
    console.error("Failed to create requirement:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to add requirements." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    return { success: false, error: "We couldn't add this requirement. Please try again." };
  }
}

// ─── Update Requirement ───────────────────────────────────────────────────────────

export async function updateRequirement(
  tradeCaseId: string,
  requirementId: string,
  formData: unknown
) {
  try {
    // Security: enforce signed-in + ownership.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Verify ownership: requirement must belong to this trade case
    const existing = await prisma.requirement.findFirst({
      where: { id: requirementId, tradeCaseId },
    });

    if (!existing) {
      return { success: false, error: "Requirement not found." };
    }

    const validatedData = updateRequirementSchema.parse(formData);

    await prisma.requirement.update({
      where: { id: requirementId },
      data: {
        title: validatedData.title,
        status: validatedData.status,
        source: validatedData.source || null,
      },
    });

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/requirements`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update requirement:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to update requirements." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Requirement not found." };
    }
    return { success: false, error: "We couldn't update this requirement. Please try again." };
  }
}

// ─── Delete Requirement ───────────────────────────────────────────────────────────

export async function deleteRequirement(tradeCaseId: string, requirementId: string) {
  try {
    // Security: enforce signed-in + ownership.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Verify ownership
    const existing = await prisma.requirement.findFirst({
      where: { id: requirementId, tradeCaseId },
    });

    if (!existing) {
      return { success: false, error: "Requirement not found." };
    }

    await prisma.requirement.delete({
      where: { id: requirementId },
    });

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/requirements`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to remove requirement:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to delete requirements." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Requirement not found." };
    }
    return { success: false, error: "We couldn't remove this requirement. Please try again." };
  }
}
