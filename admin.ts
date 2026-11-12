import { z } from "zod";

export const listUsersSchema = z.object({
  status: z.enum(["pendente", "aprovado", "recusado"]).optional(),
  q: z.string().trim().max(120).optional(),
});

export const rejectUserSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
