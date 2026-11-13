import { Prisma, User } from "@prisma/client";
import { Router } from "express";
import { AppError, asyncHandler } from "../lib/http";
import { sendUserStatusEmail } from "../lib/mailer";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middleware/auth";
import { listUsersSchema, rejectUserSchema } from "../validators/admin";

const router = Router();

type UserWithSubjects = Prisma.UserGetPayload<{
  include: {
    professorSubjects: { include: { subject: true } };
    professorProfile: { include: { classes: { include: { class: true } }; lab: true } };
  };
}>;

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    approvedAt: user.approvedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function publicUserWithSubjects(user: UserWithSubjects) {
  return {
    ...publicUser(user),
    subjects: user.professorSubjects.map((item) => item.subject.name),
    classes: (user.professorProfile?.classes ?? []).map((item) => item.class.name),
    labId: user.professorProfile?.labId ?? null,
    labName: user.professorProfile?.lab?.name ?? null,
  };
}

router.use(authRequired, requireRole("secretaria", "admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listUsersSchema.parse(req.query);

    const users = await prisma.user.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q } },
                { email: { contains: query.q } },
              ],
            }
          : {}),
      },
      include: {
        professorSubjects: { include: { subject: true } },
        professorProfile: { include: { classes: { include: { class: true } }, lab: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    res.json({ users: users.map(publicUserWithSubjects) });
  })
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!user) {
      throw new AppError(404, "Usuário não encontrado.");
    }

    if (user.status === "aprovado") {
      res.json({
        message: "Este usuário já está aprovado.",
        user: publicUser(user),
        emailSent: false,
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          status: "aprovado",
          approvedAt: new Date(),
          approvedById: req.user!.id,
        },
      });

      await tx.userApprovalToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      return saved;
    }, { timeout: 20_000 });

    const email = await sendUserStatusEmail(updated, "approve");

    res.json({
      message: "Cadastro aprovado com sucesso.",
      user: publicUser(updated),
      emailSent: email.sent,
    });
  })
);

router.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const data = rejectUserSchema.parse(req.body ?? {});
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!user) {
      throw new AppError(404, "Usuário não encontrado.");
    }

    if (user.status === "recusado") {
      res.json({
        message: "Este usuário já está recusado.",
        user: publicUser(user),
        emailSent: false,
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          status: "recusado",
          approvedAt: new Date(),
          approvedById: req.user!.id,
        },
      });

      await tx.userApprovalToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      return saved;
    }, { timeout: 20_000 });

    const email = await sendUserStatusEmail(updated, "reject", data.reason);

    res.json({
      message: "Cadastro recusado.",
      user: publicUser(updated),
      emailSent: email.sent,
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "admin") {
      throw new AppError(403, "Apenas administradores podem excluir usuários.");
    }

    if (req.params.id === req.user!.id) {
      throw new AppError(400, "Você não pode excluir seu próprio usuário.");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!user) {
      throw new AppError(404, "Usuário não encontrado.");
    }

    const [reservations, exceptions, blockedSlots] = await Promise.all([
      prisma.reservation.count({
        where: {
          OR: [{ professorId: user.id }, { createdById: user.id }],
        },
      }),
      prisma.reservationException.count({ where: { createdById: user.id } }),
      prisma.blockedSlot.count({ where: { createdById: user.id } }),
    ]);

    if (reservations > 0 || exceptions > 0 || blockedSlots > 0) {
      throw new AppError(
        409,
        "Este usuário possui registros vinculados e não pode ser excluído. Recuse o cadastro em vez de excluir."
      );
    }

    await prisma.user.delete({ where: { id: user.id } });
    res.status(204).send();
  })
);

export default router;
