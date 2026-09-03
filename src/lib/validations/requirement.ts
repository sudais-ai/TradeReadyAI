import { z } from "zod";

export const requirementStatusEnum = z.enum(["Needs review", "Confirmed", "May be required"]);

export const createRequirementSchema = z.object({
  title: z.string().min(1, "Requirement title is required").max(120, "Title is too long"),
  status: requirementStatusEnum.default("Needs review"),
  source: z.string().max(255, "Source is too long").optional().nullable(),
});

export const updateRequirementSchema = z.object({
  title: z.string().min(1, "Requirement title is required").max(120, "Title is too long"),
  status: requirementStatusEnum,
  source: z.string().max(255, "Source is too long").optional().nullable(),
});
