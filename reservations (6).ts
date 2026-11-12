import { z } from "zod";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");

const periodValue = z.union([
  z.number().int().positive(),
  z.string().trim().min(1).max(30),
]);

export const createReservationSchema = z.object({
  lab: z.string().trim().min(1).max(80).optional(),
  dia: z.string().trim().max(200).optional(),
  dias: z.array(z.string().trim().min(1).max(30)).max(7).optional(),
  turno: z.string().trim().max(20).optional(),
  aula: z.string().trim().max(200).optional(),
  aulas: z.array(periodValue).max(12).optional(),
  disciplina: z.string().trim().max(500).optional(),
  disciplinas: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  validFrom: dateOnly.optional(),
  validUntil: dateOnly.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const reservationApprovalSchema = z.object({
  token: z.string().trim().min(20, "Token invalido."),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
  lab: z.string().trim().min(1).max(80).optional(),
});

export const approveReservationSchema = z.object({
  lab: z.string().trim().min(1, "Informe o laboratorio.").max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const rejectReservationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
