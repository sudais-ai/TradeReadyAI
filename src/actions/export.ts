"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireOwnedTradeCase } from "@/lib/auth/session";
import type { ExportData } from "@/lib/export/format-report";

export type { ExportData };

export async function generateExportData(tradeCaseId: string): Promise<{ success: boolean; data?: ExportData; error?: string }> {
  try {
    // Security: enforce signed-in + ownership.
    const userId = await requireAuth();
    await requireOwnedTradeCase(userId, tradeCaseId);

    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id: tradeCaseId, userId, deletedAt: null },
      include: {
        product: true,
        documents: {
          where: { deletedAt: null },
          include: {
            _count: {
              select: { chunks: true },
            },
          },
          orderBy: { name: "asc" },
        },
        requirements: {
          include: {
            evaluation: {
              include: {
                evidences: {
                  // Phase 15: only pull the fields the export actually
                  // needs (reason, contentSnapshot, document name).
                  include: {
                    chunk: {
                      select: {
                        content: true,
                        document: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { title: "asc" },
        },
      },
    });

    if (!tradeCase) {
      return { success: false, error: "Trade case not found." };
    }

    const exportData: ExportData = {
      tradeCase: {
        id: tradeCase.id,
        direction: tradeCase.direction,
        origin: tradeCase.origin,
        destination: tradeCase.destination,
        shipmentDate: tradeCase.shipmentDate,
        estimatedValue: tradeCase.estimatedValue,
        status: tradeCase.status,
        createdAt: tradeCase.createdAt.toISOString(),
        updatedAt: tradeCase.updatedAt.toISOString(),
      },
      product: tradeCase.product
        ? {
            name: tradeCase.product.name,
            description: tradeCase.product.description,
            category: tradeCase.product.category,
            material: tradeCase.product.material,
            packaging: tradeCase.product.packaging,
            intendedUse: tradeCase.product.intendedUse,
            origin: tradeCase.product.origin,
            quantity: tradeCase.product.quantity,
            weight: tradeCase.product.weight,
          }
        : null,
      documents: tradeCase.documents.map((doc) => ({
        name: doc.name,
        type: doc.type,
        status: doc.status,
        processingStatus: doc.processingStatus,
        embeddingStatus: doc.embeddingStatus,
        chunkCount: doc._count.chunks,
      })),
      requirements: tradeCase.requirements.map((req) => ({
        title: req.title,
        status: req.status,
        source: req.source,
        evaluation: req.evaluation
          ? {
              status: req.evaluation.status,
              summary: req.evaluation.summary,
              confidence: req.evaluation.confidence,
              evidences: req.evaluation.evidences.map((ev) => ({
                reason: ev.reason,
                contentSnapshot: ev.contentSnapshot,
                documentName: ev.chunk.document.name,
              })),
            }
          : null,
      })),
      generatedAt: new Date().toISOString(),
    };

    return { success: true, data: exportData };
  } catch (error) {
    console.error("Failed to generate export data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate export data.",
    };
  }
}
