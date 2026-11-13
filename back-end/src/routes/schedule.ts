import { Prisma } from "@prisma/client";
import { Router } from "express";
import { AppError, asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middleware/auth";
import {
  deleteScheduleEntrySchema,
  saveScheduleEntrySchema,
} from "../validators/schedule";

const router = Router();

const WEEKDAY_ALIASES = new Map<string, number>([
  ["seg", 1],
  ["segunda", 1],
  ["ter", 2],
  ["terca", 2],
  ["qua", 3],
  ["quarta", 3],
  ["qui", 4],
  ["quinta", 4],
  ["sex", 5],
  ["sexta", 5],
  ["1", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
]);

const scheduleInclude = {
  lab: true,
  period: true,
} satisfies Prisma.ScheduleEntryInclude;

type ScheduleRow = Prisma.ScheduleEntryGetPayload<{
  include: typeof scheduleInclude;
}>;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseWeekday(value: string | number): number {
  const weekday = WEEKDAY_ALIASES.get(normalize(String(value)));

  if (weekday === undefined) {
    throw new AppError(400, `Dia da semana invalido: ${value}.`);
  }

  return weekday;
}

function parsePeriod(value: string | number): number {
  const match = String(value).match(/\d+/);
  const orderIndex = match ? Number(match[0]) : NaN;

  if (!Number.isInteger(orderIndex) || orderIndex < 1 || orderIndex > 12) {
    throw new AppError(400, `Aula invalida: ${value}.`);
  }

  return orderIndex;
}

function publicScheduleEntry(entry: ScheduleRow) {
  return {
    id: entry.id,
    lab: entry.lab.name,
    labId: entry.labId,
    weekday: entry.weekday,
    period: entry.period.orderIndex,
    periodLabel: entry.period.label,
    shift: entry.period.shift,
    startTime: entry.period.startTime,
    endTime: entry.period.endTime,
    professor: entry.professor,
    subject: entry.subject,
    notes: entry.notes ?? "",
  };
}

async function resolveCell(input: {
  lab: string;
  weekday: string | number;
  period: string | number;
}) {
  const weekday = parseWeekday(input.weekday);
  const orderIndex = parsePeriod(input.period);

  const [lab, period] = await Promise.all([
    prisma.lab.findFirst({
      where: { name: { equals: input.lab, mode: "insensitive" }, active: true },
    }),
    prisma.period.findFirst({
      where: { orderIndex, active: true },
    }),
  ]);

  if (!lab) {
    throw new AppError(404, `Laboratorio nao encontrado: ${input.lab}.`);
  }

  if (!period) {
    throw new AppError(404, `Aula nao encontrada: ${input.period}.`);
  }

  return { lab, period, weekday };
}

router.get(
  "/schedule",
  authRequired,
  asyncHandler(async (_req, res) => {
    const entries = await prisma.scheduleEntry.findMany({
      include: scheduleInclude,
      orderBy: [{ weekday: "asc" }, { period: { orderIndex: "asc" } }],
    });

    res.json({ entries: entries.map(publicScheduleEntry) });
  })
);

router.put(
  "/schedule",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const data = saveScheduleEntrySchema.parse(req.body);
    const { lab, period, weekday } = await resolveCell(data);

    const entry = await prisma.scheduleEntry.upsert({
      where: {
        labId_weekday_periodId: {
          labId: lab.id,
          weekday,
          periodId: period.id,
        },
      },
      update: {
        professor: data.professor,
        subject: data.subject,
        notes: data.notes,
      },
      create: {
        labId: lab.id,
        weekday,
        periodId: period.id,
        professor: data.professor,
        subject: data.subject,
        notes: data.notes,
      },
      include: scheduleInclude,
    });

    res.json({ entry: publicScheduleEntry(entry) });
  })
);

router.delete(
  "/schedule",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const data = deleteScheduleEntrySchema.parse(req.query);
    const { lab, period, weekday } = await resolveCell(data);

    await prisma.scheduleEntry.deleteMany({
      where: { labId: lab.id, weekday, periodId: period.id },
    });

    res.json({ ok: true });
  })
);

export default router;
