import { z } from "zod";

export const updateProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  material: z.string().optional(),
  packaging: z.string().optional(),
  intendedUse: z.string().optional(),
  origin: z.string().optional(),
  quantity: z.string().optional(),
  weight: z.string().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
