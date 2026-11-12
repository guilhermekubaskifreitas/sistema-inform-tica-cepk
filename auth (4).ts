import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(3, "Informe seu nome completo.").max(120),
    email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
    password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72),
    subjects: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    subject: z.string().trim().max(500).optional(),
    adminRequest: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSubjects = (data.subjects?.length ?? 0) > 0;
    const hasLegacySubject = Boolean(data.subject?.trim());
    if (!data.adminRequest && !hasSubjects && !hasLegacySubject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe ao menos uma disciplina.",
        path: ["subjects"],
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export const approvalSchema = z.object({
  token: z.string().trim().min(20, "Token inválido."),
  action: z.enum(["approve", "reject"]),
});
