import { z } from "zod";

export const DOCUMENT_TYPES = [
  "Commercial Invoice",
  "Packing List",
  "Certificate of Origin",
  "Bill of Lading",
  "Air Waybill",
  "Customs Declaration",
  "Phytosanitary Certificate",
  "Health Certificate",
  "Product Specification",
  "Material Safety Data Sheet",
  "Other",
] as const;

export const DOCUMENT_STATUSES = [
  "Not Added",
  "Added",
  "Pending",
  "Reviewed",
] as const;

export const createDocumentSchema = z.object({
  name: z.string().min(1, "Document name is required"),
  type: z.string().min(1, "Document type is required"),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
  name: z.string().min(1, "Document name is required"),
  type: z.string().optional(),
  status: z.enum(DOCUMENT_STATUSES, { message: "Invalid status" }),
  description: z.string().optional(),
});

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
