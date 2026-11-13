import { Router } from "express";
import { AppError, asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middleware/auth";
import { createClassSchema, updateLabSchema, createLabSchema } from "../validators/catalog";

const router = Router();

router.get(
  "/catalog",
  asyncHandler(async (_req, res) => {
    const [labs, periods, subjects, classes] = await Promise.all([
      prisma.lab.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.period.findMany({
        where: { active: true },
        orderBy: [{ shift: "asc" }, { orderIndex: "asc" }],
      }),
      prisma.subject.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.class.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);

    res.json({ labs, periods, subjects, classes });
  })
);

router.get(
  "/labs",
  asyncHandler(async (_req, res) => {
    const labs = await prisma.lab.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    res.json({ labs });
  })
);

router.get(
  "/periods",
  asyncHandler(async (_req, res) => {
    const periods = await prisma.period.findMany({
      where: { active: true },
      orderBy: [{ shift: "asc" }, { orderIndex: "asc" }],
    });

    res.json({ periods });
  })
);

router.get(
  "/subjects",
  asyncHandler(async (_req, res) => {
    const subjects = await prisma.subject.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    res.json({ subjects });
  })
);

router.get(
  "/classes",
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    res.json({ classes });
  })
);

router.get(
  "/labs",
  asyncHandler(async (req, res) => {
    const includeInactive =
      req.query.includeInactive === "true" || req.query.includeInactive === "1";
    const isStaff =
      req.user?.role === "secretaria" || req.user?.role === "admin";

    const labs = await prisma.lab.findMany({
      where: includeInactive && isStaff ? {} : { active: true },
      orderBy: { name: "asc" },
    });

    res.json({ labs });
  })
);

router.post(
  "/labs",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const data = createLabSchema.parse(req.body ?? {});

    const existing = await prisma.lab.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new AppError(409, "Já existe um laboratório com este nome.");
    }

    const lab = await prisma.lab.create({
      data: {
        name: data.name,
        location: data.location ?? null,
        studentCapacity: data.studentCapacity ?? null,
        pcCount: data.pcCount ?? null,
        notes: data.notes ?? null,
        active: data.active ?? true,
      },
    });

    res.status(201).json({ lab });
  })
);

router.put(
  "/labs/:id",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const data = updateLabSchema.parse(req.body ?? {});
    const current = await prisma.lab.findUnique({ where: { id: Number(req.params.id) } });

    if (!current) {
      throw new AppError(404, "Laboratório não encontrado.");
    }

    const duplicate = await prisma.lab.findFirst({
      where: { name: data.name, id: { not: current.id } },
    });

    if (duplicate) {
      throw new AppError(409, "Já existe um laboratório com este nome.");
    }

    const lab = await prisma.lab.update({
      where: { id: current.id },
      data: {
        name: data.name,
        location: data.location ?? current.location ?? null,
        studentCapacity: data.studentCapacity ?? current.studentCapacity ?? null,
        pcCount: data.pcCount ?? current.pcCount ?? null,
        notes: data.notes ?? current.notes ?? null,
        active: data.active ?? current.active,
      },
    });

    res.json({ lab });
  })
);

router.delete(
  "/labs/:id",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const current = await prisma.lab.findUnique({ where: { id: Number(req.params.id) } });

    if (!current) {
      throw new AppError(404, "Laboratório não encontrado.");
    }

    const [reservations, scheduleEntries] = await Promise.all([
      prisma.reservation.count({ where: { labId: current.id } }),
      prisma.scheduleEntry.count({ where: { labId: current.id } }),
    ]);

    if (reservations > 0 || scheduleEntries > 0) {
      throw new AppError(
        409,
        "Este laboratório possui reservas ou horários vinculados. Desative-o em vez de excluir."
      );
    }

    await prisma.lab.delete({ where: { id: current.id } });

    res.status(204).send();
  })
);

router.get(
  "/classes",
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      where: { active: true },
      orderBy: [{ shift: "asc" }, { name: "asc" }],
    });

    res.json({ classes });
  })
);

router.post(
  "/classes",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (req, res) => {
    const data = createClassSchema.parse(req.body ?? {});
    const shift = data.shift ?? null;

    const existing = await prisma.class.findFirst({
      where: { name: data.name, shift },
    });

    if (existing) {
      res.status(200).json({ class: existing, created: false });
      return;
    }

    const created = await prisma.class.create({
      data: {
        name: data.name,
        shift,
        grade: data.grade ?? null,
        studentCount: data.studentCount ?? null,
      },
    });

    res.status(201).json({ class: created, created: true });
  })
);

router.get(
  "/professors",
  authRequired,
  requireRole("secretaria", "admin"),
  asyncHandler(async (_req, res) => {
    const professors = await prisma.professor.findMany({
      include: {
        classes: { include: { class: true } },
        lab: true,
        user: { select: { id: true, email: true, status: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      professors: professors.map((professor) => ({
        id: professor.id,
        name: professor.name,
        email: professor.user?.email ?? null,
        status: professor.user?.status ?? null,
        labId: professor.labId,
        labName: professor.lab?.name ?? null,
        classes: professor.classes.map((item) => item.class.name),
      })),
    });
  })
);

export default router;
