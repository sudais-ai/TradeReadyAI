import { z } from "zod";

export const ragEvaluationStatusEnum = z.enum([
  "PENDING",
  "PROCESSING",
  "SATISFIED",
  "NOT_SATISFIED",
  "INSUFFICIENT_EVIDENCE",
  "FAILED",
]);

export type RagEvaluationStatus = z.infer<typeof ragEvaluationStatusEnum>;

export const ragEvidenceSchema = z.object({
  chunkId: z.string().describe("The exact ID of the chunk used as evidence"),
  reason: z.string().describe("Why this chunk supports the conclusion"),
});

export const ragEvaluationResponseSchema = z.object({
  status: ragEvaluationStatusEnum,
  summary: z.string().describe("A human-friendly explanation of the conclusion"),
  confidence: z.number().min(0).max(1).describe("Estimated confidence in this conclusion from 0.0 to 1.0"),
  evidence: z.array(ragEvidenceSchema).describe("List of chunks that support this conclusion. Empty if INSUFFICIENT_EVIDENCE."),
});

export type RagEvaluationResponse = z.infer<typeof ragEvaluationResponseSchema>;
