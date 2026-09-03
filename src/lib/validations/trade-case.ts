import { z } from "zod";

export const createTradeCaseSchema = z.object({
  productName: z.string().min(1, "Product name is required"),
  direction: z.enum(["export", "import"], {
    message: "Direction is required",
  }),
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  date: z.string().optional(),
  value: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});

export type CreateTradeCaseInput = z.infer<typeof createTradeCaseSchema>;

export const updateTradeCaseSchema = createTradeCaseSchema;
export type UpdateTradeCaseInput = z.infer<typeof updateTradeCaseSchema>;
