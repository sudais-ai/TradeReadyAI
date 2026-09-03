"use server";

import { prisma } from "@/lib/db/prisma";
import { updateProductSchema } from "@/lib/validations/product";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  requireOwnedTradeCase,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/session";

export async function updateProduct(tradeCaseId: string, formData: unknown) {
  try {
    const validatedData = updateProductSchema.parse(formData);

    // Security: enforce signed-in + ownership.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    // Security: verify the product belongs to this trade case and the
    // case is not soft-deleted (Phase 13).
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id: tradeCaseId, deletedAt: null },
      include: { product: true },
    });

    if (!tradeCase) {
      return { success: false, error: "Trade case not found." };
    }

    if (!tradeCase.product) {
      // Create the product if it doesn't exist yet
      await prisma.product.create({
        data: {
          tradeCaseId,
          name: validatedData.name,
          description: validatedData.description,
          category: validatedData.category,
          material: validatedData.material,
          packaging: validatedData.packaging,
          intendedUse: validatedData.intendedUse,
          origin: validatedData.origin,
          quantity: validatedData.quantity,
          weight: validatedData.weight,
        },
      });
    } else {
      // Update the existing product, verifying ownership by tradeCaseId
      await prisma.product.update({
        where: {
          id: tradeCase.product.id,
          tradeCaseId, // double-check ownership at query level
        },
        data: {
          name: validatedData.name,
          description: validatedData.description,
          category: validatedData.category,
          material: validatedData.material,
          packaging: validatedData.packaging,
          intendedUse: validatedData.intendedUse,
          origin: validatedData.origin,
          quantity: validatedData.quantity,
          weight: validatedData.weight,
        },
      });
    }

    try {
      revalidatePath(`/cases/${tradeCaseId}`);
      revalidatePath(`/cases/${tradeCaseId}/product`);
      revalidatePath(`/cases/${tradeCaseId}/review`);
    } catch {
      // Ignore static generation store missing errors when running outside Next.js
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update product:", error);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: "You must be signed in to update products." };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, error: "Trade case not found." };
    }
    if (error instanceof Error) {
      // Don't expose internal details
      if (error.name === "ZodError") {
        return { success: false, error: "Some fields are invalid. Please check and try again." };
      }
    }
    return { success: false, error: "We couldn't save these product details. Please try again." };
  }
}
