import { z } from "zod";

const scheduleKey = {
  lab: z.string().trim().min(1, "Informe o laboratorio.").max(80),
  weekday: z.union([
    z.number().int().min(1).max(5),
    z.string().trim().min(1).max(30),
  ]),
  period: z.union([
    z.number().int().min(1).max(12),
    z.string().trim().min(1).max(30),
  ]),
};

export const saveScheduleEntrySchema = z.object({
  ...scheduleKey,
  professor: z.string().trim().min(1, "Informe o professor.").max(120),
  subject: z.string().trim().min(1, "Informe a materia.").max(160),
  notes: z.string().trim().max(1000).optional(),
});

export const deleteScheduleEntrySchema = z.object(scheduleKey);
