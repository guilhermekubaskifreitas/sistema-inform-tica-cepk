import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const optionalInt = (label: string) =>
  z
    .union([z.number().int().min(0), z.string().trim()])
    .optional()
    .nullable()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${label} inválido.`);
      }
      return Math.trunc(parsed);
    });

export const createLabSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome entre 2 e 80 caracteres.").max(80),
  location: optionalText(120),
  studentCapacity: optionalInt("Capacidade"),
  pcCount: optionalInt("Quantidade de computadores"),
  notes: optionalText(1000),
  active: z.boolean().optional(),
});

export const updateLabSchema = createLabSchema.partial().extend({
  name: z.string().trim().min(2, "Informe um nome entre 2 e 80 caracteres.").max(80),
});

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da turma.").max(40),
  grade: z.string().trim().max(40).optional(),
  shift: z.enum(["manha", "tarde"]).optional(),
  studentCount: z.coerce.number().int().min(0).optional(),
});
