import { Router, Response } from "express";
import type { User } from "@prisma/client";
import { allowedEmailDomains, env, parseEmailList } from "../config/env";
import { AppError, asyncHandler, wantsJson } from "../lib/http";
import { sendApprovalEmail, sendUserStatusEmail } from "../lib/mailer";
import { hashPassword, verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import {
  approvalExpiryDate,
  randomToken,
  refreshExpiryDate,
  sha256,
  signAccessToken,
} from "../lib/tokens";
import { authRequired } from "../middleware/auth";
import { approvalSchema, loginSchema, registerSchema } from "../validators/auth";

const router = Router();
const REFRESH_COOKIE = "cepk_refresh";

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

  function subjectNames(input: { subjects?: string[]; subject?: string }): string[] {
    const source = input.subjects?.length
      ? input.subjects
      : (input.subject ?? "").split(/[,;\n]/);
    return Array.from(new Set(source.map((item) => item.trim()).filter(Boolean)));
  }

  function classNames(input: { classes?: string[]; turma?: string }): string[] {
    const source = input.classes?.length
      ? input.classes
      : (input.turma ?? "").split(/[,;\n]/);
    return Array.from(new Set(source.map((item) => item.trim()).filter(Boolean)));
  }

function isConfiguredAdmin(email: string): boolean {
  return parseEmailList(env.ADMIN_EMAIL).includes(email.toLowerCase());
}

function assertAllowedEmail(email: string): void {
  if (allowedEmailDomains.length === 0) {
    return;
  }

  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain || !allowedEmailDomains.includes(domain)) {
    throw new AppError(
      400,
      `Use um e-mail de um dos domínios permitidos: ${allowedEmailDomains.map((item) => `@${item}`).join(", ")}.`
    );
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    path: "/auth",
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | Agenda CEPK</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f3f6fb; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
      .card { width: 100%; max-width: 560px; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(15, 23, 42, .12); }
      .top { padding: 22px 28px; background: #0f3d66; color: #fff; }
      .top small { display: block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .8; }
      .top strong { display: block; margin-top: 3px; font-size: 24px; }
      .content { padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 23px; color: #0f3d66; }
      p { line-height: 1.6; }
      .details { margin: 18px 0 22px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; font-size: 14px; }
      .details div + div { margin-top: 6px; }
      .details span { color: #64748b; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0; }
      button { border: 0; border-radius: 10px; padding: 13px 20px; font-size: 15px; font-weight: 700; cursor: pointer; }
      .approve { background: #16803c; color: #fff; }
      .reject { background: #fff; color: #b42318; border: 2px solid #b42318; padding: 11px 18px; }
      .note { margin-top: 20px; font-size: 12px; color: #64748b; }
      textarea { width: 100%; min-height: 80px; margin-top: 8px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; resize: vertical; }
      label { display: block; margin-top: 18px; font-size: 13px; font-weight: 700; }
      .success { border-left: 4px solid #16803c; background: #ecfdf3; padding: 14px 16px; border-radius: 8px; }
      .error { border-left: 4px solid #b42318; background: #fef3f2; padding: 14px 16px; border-radius: 8px; }
      .info { border-left: 4px solid #0f3d66; background: #eff6ff; padding: 14px 16px; border-radius: 8px; }
      a { color: #0f3d66; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="top">
        <small>Agenda dos Laboratórios</small>
        <strong>CEPK</strong>
      </div>
      <div class="content">${body}</div>
    </main>
  </body>
</html>`;
}

function approvalPage(input: {
  title: string;
  message: string;
  user?: { name: string; email: string; subjects: string[] };
  token?: string;
  action?: "approve" | "reject";
  error?: boolean;
  tone?: "success" | "error" | "info";
}): string {
  const details = input.user
    ? `<div class="details">
        <div><span>Nome:</span> ${escapeHtml(input.user.name)}</div>
        <div><span>E-mail:</span> ${escapeHtml(input.user.email)}</div>
        <div><span>Disciplinas:</span> ${escapeHtml(input.user.subjects.join(", ") || "Não informada")}</div>
      </div>`
    : "";

  const form =
    input.user && input.token
      ? `<form method="post" action="/auth/approval">
          <input type="hidden" name="token" value="${escapeHtml(input.token)}">
          <label for="reason">Motivo da recusa (opcional)</label>
          <textarea id="reason" name="reason" maxlength="500" placeholder="Será enviado ao professor somente se você recusar."></textarea>
          <div class="actions">
            <button class="approve" type="submit" name="action" value="approve">Confirmar aprovação</button>
            <button class="reject" type="submit" name="action" value="reject">Confirmar recusa</button>
          </div>
        </form>`
      : "";

  const tone = input.tone ?? (input.error ? "error" : "success");

  return pageLayout(
    input.title,
    `<h1>${escapeHtml(input.title)}</h1>
     <div class="${tone}">${escapeHtml(input.message)}</div>
     ${details}
     ${form}
     <p class="note">Este link é pessoal e expira em 48 horas. Se precisar de ajuda, procure a secretaria.</p>`
  );
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    assertAllowedEmail(data.email);

    const configuredAdmin = isConfiguredAdmin(data.email);
    const adminRequested = Boolean(data.adminRequest);
    const elevatedRole = configuredAdmin || adminRequested;
    const autoApprove = configuredAdmin;
    const subjects = subjectNames(data);
    const classes = classNames(data);
    const labId = data.labId;

    if (!adminRequested && subjects.length === 0) {
      throw new AppError(400, "Informe ao menos uma disciplina.");
    }

    if (!adminRequested && classes.length === 0) {
      throw new AppError(400, "Informe ao menos uma turma.");
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });

    if (existing?.status === "aprovado") {
      throw new AppError(409, "Este e-mail já possui cadastro aprovado. Faça login.");
    }

    if (existing?.status === "pendente" && !elevatedRole) {
      throw new AppError(409, "Já existe uma solicitação pendente para este e-mail.");
    }

    const passwordHash = await hashPassword(data.password);
    const rawToken = randomToken();
    const tokenHash = sha256(rawToken);
    const expiresAt = approvalExpiryDate();
    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
      const savedUser = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: data.name,
              passwordHash,
              role: elevatedRole ? "admin" : existing.role,
              status: autoApprove ? "aprovado" : "pendente",
              approvedAt: autoApprove ? now : null,
              approvedById: null,
              emailVerifiedAt: autoApprove ? now : null,
            },
          })
        : await tx.user.create({
            data: {
              name: data.name,
              email: data.email,
              passwordHash,
              role: elevatedRole ? "admin" : "professor",
              status: autoApprove ? "aprovado" : "pendente",
              approvedAt: autoApprove ? now : null,
              emailVerifiedAt: autoApprove ? now : null,
            },
          });

      await tx.professorSubject.deleteMany({ where: { professorId: savedUser.id } });
      await tx.userApprovalToken.updateMany({
        where: { userId: savedUser.id, usedAt: null },
        data: { usedAt: now },
      });

      for (const name of subjects) {
        const subject = await tx.subject.upsert({
          where: { name },
          update: {},
          create: { name },
        });

        await tx.professorSubject.create({
          data: { professorId: savedUser.id, subjectId: subject.id },
        });
      }

      // Perfil do professor: turmas que leciona + laboratorio principal
      const classRows = [];
      for (const className of classes) {
        // Reaproveita a turma existente (qualquer turno) para nao duplicar a lista oficial.
        const existing = await tx.class.findFirst({
          where: { name: className },
          orderBy: { shift: "asc" },
        });
        const row = existing ?? await tx.class.create({ data: { name: className } });
        classRows.push(row);
      }

      if (classRows.length) {
        await tx.professor.upsert({
          where: { userId: savedUser.id },
          update: {
            name: savedUser.name,
            labId: labId ?? null,
          },
          create: {
            userId: savedUser.id,
            name: savedUser.name,
            labId: labId ?? null,
          },
        });

        const profile = await tx.professor.findUnique({
          where: { userId: savedUser.id },
        });

        if (profile) {
          await tx.professorClass.deleteMany({ where: { professorId: profile.id } });
          for (const row of classRows) {
            await tx.professorClass.create({
              data: { professorId: profile.id, classId: row.id },
            });
          }
        }
      }

      if (!autoApprove) {
        await tx.userApprovalToken.create({
          data: { userId: savedUser.id, tokenHash, expiresAt },
        });
      }

      return savedUser;
    }, { timeout: 20_000 });

    const email = autoApprove
      ? { sent: true, error: undefined }
      : await sendApprovalEmail(
          { name: user.name, email: user.email, subjects, requestedAdmin: elevatedRole },
          rawToken
        );

    res.status(201).json({
      message: autoApprove
        ? "Cadastro de administrador criado e liberado. Faça login para continuar."
        : adminRequested
          ? "Solicitação de acesso administrativo registrada. Aguarde a validação da secretaria."
          : "Solicitação registrada. Aguarde a aprovação da secretaria.",
      admin: autoApprove,
      requestedAdmin: elevatedRole,
      requiresApproval: !autoApprove,
      user: { ...publicUser(user), classes },
      emailSent: email.sent,
      emailError: email.sent ? undefined : email.error,
      ...(!autoApprove && env.NODE_ENV !== "production"
        ? { token: rawToken }
        : {}),
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new AppError(401, "E-mail ou senha inválidos.");
    }

    if (user.status === "pendente") {
      throw new AppError(403, "Seu cadastro está aguardando aprovação da secretaria.");
    }

    if (user.status === "recusado") {
      throw new AppError(403, "Seu cadastro foi recusado. Procure a secretaria.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const rawRefreshToken = randomToken(48);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawRefreshToken),
        expiresAt: refreshExpiryDate(),
      },
    });

    setRefreshCookie(res, rawRefreshToken);

    res.json({
      accessToken: signAccessToken(user),
      user: publicUser(user),
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const rawToken =
      typeof req.cookies?.[REFRESH_COOKIE] === "string"
        ? req.cookies[REFRESH_COOKIE]
        : typeof req.body?.refreshToken === "string"
          ? req.body.refreshToken
          : "";

    if (!rawToken) {
      throw new AppError(401, "Sessão expirada.");
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      throw new AppError(401, "Sessão expirada. Faça login novamente.");
    }

    if (stored.user.status !== "aprovado") {
      clearRefreshCookie(res);
      throw new AppError(403, "Cadastro não aprovado.");
    }

    const newRawToken = randomToken(48);

    const rotated = await prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count === 0) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: sha256(newRawToken),
          expiresAt: refreshExpiryDate(),
        },
      });

      return true;
    }, { timeout: 20_000 });

    if (!rotated) {
      clearRefreshCookie(res);
      throw new AppError(401, "Sessão expirada. Faça login novamente.");
    }

    setRefreshCookie(res, newRawToken);

    res.json({
      accessToken: signAccessToken(stored.user),
      user: publicUser(stored.user),
    });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const rawToken =
      typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : "";

    if (rawToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    clearRefreshCookie(res);
    res.status(204).send();
  })
);

router.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        professorSubjects: { include: { subject: true } },
        professorProfile: { include: { classes: { include: { class: true } }, lab: true } },
      },
    });

    if (!user) {
      throw new AppError(404, "Usuário não encontrado.");
    }

    res.json({
      user: {
        ...publicUser(user),
        subjects: user.professorSubjects.map((item) => item.subject.name),
        classes: (user.professorProfile?.classes ?? []).map((item) => item.class.name),
        labId: user.professorProfile?.labId ?? null,
        labName: user.professorProfile?.lab?.name ?? null,
      },
    });
  })
);

router.get(
  "/approval",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const action = req.query.action === "reject" ? "reject" : "approve";

    if (!token) {
      res.status(400).send(
        approvalPage({
          title: "Link inválido",
          message: "O link de aprovação está incompleto. Solicite um novo cadastro ou procure a secretaria.",
          error: true,
        })
      );
      return;
    }

    const stored = await prisma.userApprovalToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: { include: { professorSubjects: { include: { subject: true } } } },
      },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      res.status(410).send(
        approvalPage({
          title: "Link expirado",
          message: "Este link de aprovação já foi usado ou expirou. Se necessário, peça ao professor para realizar um novo cadastro.",
          error: true,
        })
      );
      return;
    }

    if (stored.user.status !== "pendente") {
      res.status(200).send(
        approvalPage({
          title: "Solicitação já processada",
          message:
            stored.user.status === "aprovado"
              ? "Este cadastro já foi aprovado anteriormente."
              : "Este cadastro já foi recusado anteriormente.",
          error: stored.user.status === "recusado",
        })
      );
      return;
    }

    res.send(
      approvalPage({
        title: action === "reject" ? "Recusar cadastro" : "Aprovar cadastro",
        message:
          action === "reject"
            ? "Revise os dados e confirme a recusa. Você pode informar um motivo opcional."
            : "Revise os dados e confirme a aprovação para liberar o acesso do professor.",
        user: {
          name: stored.user.name,
          email: stored.user.email,
          subjects: stored.user.professorSubjects.map((item) => item.subject.name),
        },
        token,
        action,
        tone: "info",
      })
    );
  })
);

router.post(
  "/approval",
  asyncHandler(async (req, res) => {
    const parsed = approvalSchema.safeParse(req.body);

    if (!parsed.success) {
      const message = "Não foi possível identificar a decisão. Abra novamente o link do e-mail.";

      if (wantsJson(req)) {
        throw new AppError(400, message);
      }

      res.status(400).send(
        approvalPage({
          title: "Ação inválida",
          message,
          error: true,
        })
      );
      return;
    }

    const { token, action } = parsed.data;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : undefined;

    const stored = await prisma.userApprovalToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: { include: { professorSubjects: { include: { subject: true } } } },
      },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      const message = "Este link de aprovação já foi usado ou expirou.";

      if (wantsJson(req)) {
        throw new AppError(410, message);
      }

      res.status(410).send(
        approvalPage({
          title: "Link expirado",
          message,
          error: true,
        })
      );
      return;
    }

    if (stored.user.status !== "pendente") {
      const message = "Esta solicitação já foi processada.";

      if (wantsJson(req)) {
        res.status(409).json({ error: message, status: stored.user.status });
        return;
      }

      res.status(409).send(
        approvalPage({
          title: "Solicitação já processada",
          message,
          error: true,
        })
      );
      return;
    }

    const newStatus = action === "approve" ? "aprovado" : "recusado";

    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: {
          status: newStatus,
          approvedAt: new Date(),
          approvedById: null,
        },
      }),
      prisma.userApprovalToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      prisma.userApprovalToken.updateMany({
        where: { userId: stored.userId, id: { not: stored.id }, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    const email = await sendUserStatusEmail(stored.user, action, reason);

    if (wantsJson(req)) {
      res.json({
        ok: true,
        status: newStatus,
        message:
          newStatus === "aprovado"
            ? "Cadastro aprovado com sucesso."
            : "Cadastro recusado com sucesso.",
        emailSent: email.sent,
      });
      return;
    }

    res.status(200).send(
      approvalPage({
        title: newStatus === "aprovado" ? "Cadastro aprovado" : "Cadastro recusado",
        message:
          newStatus === "aprovado"
            ? "O professor foi avisado por e-mail e já pode acessar a agenda."
            : "A recusa foi registrada. O professor foi avisado por e-mail.",
        error: newStatus === "recusado",
      })
    );
  })
);

export default router;
