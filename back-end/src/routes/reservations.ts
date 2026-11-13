import { randomUUID } from "crypto";
import { Prisma, ReservationStatus } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { AppError, asyncHandler, wantsJson } from "../lib/http";
import {
  ReservationMail,
  sendReservationApprovalEmail,
  sendReservationStatusEmail,
} from "../lib/mailer";
import { prisma } from "../lib/prisma";
import { approvalExpiryDate, randomToken, sha256 } from "../lib/tokens";
import { authRequired } from "../middleware/auth";
import {
  approveReservationSchema,
  createReservationSchema,
  reservationApprovalSchema,
  rejectReservationSchema,
} from "../validators/reservations";

const router = Router();

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const WEEKDAY_ALIASES = new Map<string, number>([
  ["dom", 0],
  ["domingo", 0],
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
  ["sab", 6],
  ["sabado", 6],
  ["0", 0],
  ["1", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
]);

  const reservationInclude = {
    lab: true,
    class: true,
    professor: true,
    periods: { include: { period: true } },
    subjects: { include: { subject: true } },
  } satisfies Prisma.ReservationInclude;

type ReservationRow = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

type CreateReservationInput = z.infer<typeof createReservationSchema>;
type PublicReservation = ReturnType<typeof publicReservationGroup>;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseWeekday(value: string | number): number {
  const key = normalize(String(value));
  const weekday = WEEKDAY_ALIASES.get(key);

  if (weekday === undefined) {
    throw new AppError(400, `Dia da semana invalido: ${value}.`);
  }

  if (weekday < 1 || weekday > 5) {
    throw new AppError(400, "Reservas sao permitidas apenas de segunda a sexta.");
  }

  return weekday;
}

function parseDays(input: { dias?: string[]; dia?: string }): number[] {
  const source = input.dias?.length
    ? input.dias
    : String(input.dia ?? "").split(/[,;\n]/);

  const days = source
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseWeekday);

  if (days.length === 0) {
    throw new AppError(400, "Informe ao menos um dia da semana.");
  }

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function parsePeriods(input: { aulas?: (string | number)[]; aula?: string }): number[] {
  const source = input.aulas?.length
    ? input.aulas
    : String(input.aula ?? "").split(/[,;\n]/);

  const periods = source
    .map((value) => {
      const match = String(value).match(/\d+/);
      const orderIndex = match ? Number(match[0]) : NaN;

      if (!Number.isInteger(orderIndex) || orderIndex < 1 || orderIndex > 12) {
        throw new AppError(400, `Aula invalida: ${value}.`);
      }

      return orderIndex;
    });

  if (periods.length === 0) {
    throw new AppError(400, "Informe ao menos uma aula.");
  }

  return Array.from(new Set(periods)).sort((a, b) => a - b);
}

function parseSubjects(input: {
  disciplinas?: string[];
  disciplina?: string;
}): string[] {
  const source = input.disciplinas?.length
    ? input.disciplinas
    : String(input.disciplina ?? "").split(/[,;\n]/);

  const subjects = Array.from(
    new Set(source.map((item) => item.trim()).filter(Boolean))
  );

  if (subjects.length === 0) {
    throw new AppError(400, "Informe ao menos uma disciplina.");
  }

  if (subjects.length > 10) {
    throw new AppError(400, "Informe no maximo 10 disciplinas.");
  }

  return subjects;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `Data invalida em ${field}.`);
  }

  return date;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function endOfYearUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function displayDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function shiftLabel(periods: ReservationRow["periods"]): string {
  const shifts = new Set(periods.map((item) => item.period.shift));

  if (shifts.size === 1 && shifts.has("manha")) {
    return "Manhã";
  }

  if (shifts.size === 1 && shifts.has("tarde")) {
    return "Tarde";
  }

  return "Ambos";
}

function publicReservationGroup(rows: ReservationRow[]) {
  const first = rows[0];

  if (!first) {
    throw new AppError(404, "Reserva nao encontrada.");
  }

  const periods = Array.from(
    new Map(
      rows
        .flatMap((row) => row.periods.map((item) => item.period))
        .map((period) => [period.id, period])
    ).values()
  ).sort((a, b) => a.orderIndex - b.orderIndex);

  const subjects = Array.from(
    new Map(
      rows
        .flatMap((row) => row.subjects.map((item) => item.subject))
        .map((subject) => [subject.id, subject])
    ).values()
  )
    .map((subject) => subject.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const weekdays = Array.from(new Set(rows.map((row) => row.weekday))).sort(
    (a, b) => a - b
  );
  const days = weekdays.map((weekday) => WEEKDAY_LABELS[weekday] ?? String(weekday));
  const orderIndexes = periods.map((period) => period.orderIndex);

    return {
      id: first.id,
      seriesId: first.seriesId,
      lab: first.lab?.name ?? "A definir",
      turma: first.class?.name ?? "",
      classe: first.class?.name ?? "",
      classId: first.classId,
      professor: first.professor.name,
    professorEmail: first.professor.email,
    disciplina: subjects.join(", "),
    disciplinas: subjects,
    dia: days.join(", "),
    dias: days,
    turno: shiftLabel(rows.flatMap((row) => row.periods)),
    aula: orderIndexes.join(","),
    aulas: orderIndexes,
    status: first.status,
    notes: first.notes ?? "",
    validFrom: dateOnly(first.validFrom),
    validUntil: dateOnly(first.validUntil),
    criadaEm: displayDate(first.createdAt),
    createdAt: first.createdAt.toISOString(),
    approvedAt: first.approvedAt ? first.approvedAt.toISOString() : null,
  };
}

function groupReservations(rows: ReservationRow[]) {
  const groups = new Map<string, ReservationRow[]>();

  for (const row of rows) {
    const key = row.seriesId || row.id;
    const group = groups.get(key);

    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return Array.from(groups.values()).map(publicReservationGroup);
}

function toReservationMail(reservation: PublicReservation): ReservationMail {
  return {
    lab: reservation.lab,
    professor: reservation.professor,
    professorEmail: reservation.professorEmail,
    dia: reservation.dia,
    turno: reservation.turno,
    aulas: reservation.aulas.map((item) => `${item}a aula`).join(", "),
    disciplinas: reservation.disciplina,
    validFrom: reservation.validFrom,
    validUntil: reservation.validUntil,
  };
}

function scheduleSubject(row: ReservationRow): string {
  const names = Array.from(
    new Set(row.subjects.map((item) => item.subject.name))
  );
  return (names.join(", ") || "A definir").slice(0, 160);
}

async function syncScheduleEntries(
  tx: Prisma.TransactionClient,
  rows: ReservationRow[],
  labId: number
): Promise<void> {
  for (const row of rows) {
    if (row.status !== "aprovada") {
      continue;
    }

    for (const item of row.periods) {
      await tx.scheduleEntry.upsert({
        where: {
          labId_weekday_periodId: {
            labId,
            weekday: row.weekday,
            periodId: item.periodId,
          },
        },
        update: {
          professor: row.professor.name,
          subject: scheduleSubject(row),
        },
        create: {
          labId,
          weekday: row.weekday,
          periodId: item.periodId,
          professor: row.professor.name,
          subject: scheduleSubject(row),
        },
      });
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function approvalPageLayout(title: string, body: string): string {
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
      textarea, select { width: 100%; margin-top: 8px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; background: #fff; }
      textarea { min-height: 80px; resize: vertical; }
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
        <small>Agenda dos Laboratorios</small>
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
  reservation?: PublicReservation;
  token?: string;
  labs?: { name: string }[];
  tone?: "success" | "error" | "info";
}): string {
  const details = input.reservation
    ? `<div class="details">
        <div><span>Solicitado por:</span> ${escapeHtml(input.reservation.professor)}</div>
        <div><span>E-mail:</span> ${escapeHtml(input.reservation.professorEmail)}</div>
        <div><span>Laboratorio:</span> ${escapeHtml(input.reservation.lab)}</div>
        <div><span>Dia:</span> ${escapeHtml(input.reservation.dia)}</div>
        <div><span>Turno:</span> ${escapeHtml(input.reservation.turno)}</div>
        <div><span>Aulas:</span> ${escapeHtml(input.reservation.aulas.map((item) => `${item}a`).join(", "))}</div>
        <div><span>Disciplinas:</span> ${escapeHtml(input.reservation.disciplina)}</div>
        <div><span>Vigencia:</span> ${escapeHtml(input.reservation.validFrom)} a ${escapeHtml(input.reservation.validUntil)}</div>
      </div>`
    : "";

  const labField =
    input.reservation?.lab === "A definir" && input.labs?.length
      ? `<label for="lab">Laboratorio disponivel</label>
         <select id="lab" name="lab" required>
           <option value="">Selecione o laboratorio</option>
           ${input.labs
             .map(
               (lab) =>
                 `<option value="${escapeHtml(lab.name)}">${escapeHtml(
                   lab.name
                 )}</option>`
             )
             .join("")}
         </select>`
      : "";

  const form =
    input.reservation && input.token
      ? `<form method="post" action="/reservations/approval">
          <input type="hidden" name="token" value="${escapeHtml(input.token)}">
          ${labField}
          <label for="reason">Motivo da recusa (opcional)</label>
          <textarea id="reason" name="reason" maxlength="500" placeholder="Sera enviado ao professor somente se voce recusar."></textarea>
          <div class="actions">
            <button class="approve" type="submit" name="action" value="approve">Confirmar aprovacao</button>
            <button class="reject" type="submit" name="action" value="reject">Confirmar recusa</button>
          </div>
        </form>`
      : "";

  const tone = input.tone ?? "success";

  return approvalPageLayout(
    input.title,
    `<h1>${escapeHtml(input.title)}</h1>
     <div class="${tone}">${escapeHtml(input.message)}</div>
     ${details}
     ${form}
     <p class="note">Este link e pessoal e expira em 48 horas. Se precisar de ajuda, procure a secretaria.</p>`
  );
}

async function loadSeries(seriesId: string): Promise<ReservationRow[]> {
  return prisma.reservation.findMany({
    where: { seriesId },
    include: reservationInclude,
    orderBy: [{ weekday: "asc" }, { createdAt: "asc" }],
  });
}

function sendPage(res: Response, status: number, html: string): void {
  res.status(status).type("html").send(html);
}

router.get(
  "/reservations/approval",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    if (!token) {
      sendPage(
        res,
        400,
        approvalPage({
          title: "Link invalido",
          message: "O link de aprovacao esta incompleto.",
          tone: "error",
        })
      );
      return;
    }

    const stored = await prisma.reservationApprovalToken.findUnique({
      where: { tokenHash: sha256(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      sendPage(
        res,
        410,
        approvalPage({
          title: "Link expirado",
          message: "Este link de aprovacao ja foi usado ou expirou.",
          tone: "error",
        })
      );
      return;
    }

    const rows = await loadSeries(stored.seriesId);

    if (rows.length === 0) {
      sendPage(
        res,
        404,
        approvalPage({
          title: "Reserva nao encontrada",
          message: "A reserva vinculada a este link nao foi encontrada.",
          tone: "error",
        })
      );
      return;
    }

    const reservation = publicReservationGroup(rows);
    const labs =
      reservation.lab === "A definir"
        ? await prisma.lab.findMany({
            where: { active: true },
            orderBy: { name: "asc" },
            select: { name: true },
          })
        : [];

    if (reservation.status !== "pendente") {
      sendPage(
        res,
        200,
        approvalPage({
          title: "Reserva ja processada",
          message:
            reservation.status === "aprovada"
              ? "Esta reserva ja foi aprovada anteriormente."
              : "Esta reserva ja foi recusada anteriormente.",
          reservation,
          tone: reservation.status === "aprovada" ? "success" : "error",
        })
      );
      return;
    }

    sendPage(
      res,
      200,
      approvalPage({
        title: "Aprovar reserva",
        message:
          "Revise os dados e confirme a aprovacao para liberar o uso do laboratorio.",
        reservation,
        token,
        labs,
        tone: "info",
      })
    );
  })
);

router.post(
  "/reservations/approval",
  asyncHandler(async (req, res) => {
    const parsed = reservationApprovalSchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) {
        throw new AppError(400, "Dados de aprovacao invalidos.");
      }

      sendPage(
        res,
        400,
        approvalPage({
          title: "Acao invalida",
          message: "Nao foi possivel identificar a decisao. Abra novamente o link do e-mail.",
          tone: "error",
        })
      );
      return;
    }

    const { token, action, reason, lab: labName } = parsed.data;
    const stored = await prisma.reservationApprovalToken.findUnique({
      where: { tokenHash: sha256(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      if (wantsJson(req)) {
        throw new AppError(410, "Este link de aprovacao ja foi usado ou expirou.");
      }

      sendPage(
        res,
        410,
        approvalPage({
          title: "Link expirado",
          message: "Este link de aprovacao ja foi usado ou expirou.",
          tone: "error",
        })
      );
      return;
    }

    const rows = await loadSeries(stored.seriesId);

    if (rows.length === 0) {
      if (wantsJson(req)) {
        throw new AppError(404, "Reserva nao encontrada.");
      }

      sendPage(
        res,
        404,
        approvalPage({
          title: "Reserva nao encontrada",
          message: "A reserva vinculada a este link nao foi encontrada.",
          tone: "error",
        })
      );
      return;
    }

    const current = publicReservationGroup(rows);

    if (current.status !== "pendente") {
      if (wantsJson(req)) {
        res.status(409).json({
          error: "Esta reserva ja foi processada.",
          status: current.status,
        });
        return;
      }

      sendPage(
        res,
        409,
        approvalPage({
          title: "Reserva ja processada",
          message: "Esta reserva ja foi processada.",
          reservation: current,
          tone: "error",
        })
      );
      return;
    }

    const status = action === "approve" ? "aprovada" : "recusada";
    let chosenLab: { id: number; name: string } | null = null;

    if (action === "approve" && current.lab === "A definir") {
      if (!labName) {
        sendPage(
          res,
          400,
          approvalPage({
            title: "Laboratorio obrigatorio",
            message:
              "Selecione o laboratorio disponivel antes de confirmar a aprovacao.",
            reservation: current,
            token,
            labs: await prisma.lab.findMany({
              where: { active: true },
              orderBy: { name: "asc" },
              select: { name: true },
            }),
            tone: "error",
          })
        );
        return;
      }

      chosenLab = await prisma.lab.findFirst({
        where: {
          name: { equals: labName, mode: "insensitive" },
          active: true,
        },
        select: { id: true, name: true },
      });

      if (!chosenLab) {
        sendPage(
          res,
          404,
          approvalPage({
            title: "Laboratorio nao encontrado",
            message: `O laboratorio informado nao existe: ${labName}.`,
            reservation: current,
            token,
            labs: await prisma.lab.findMany({
              where: { active: true },
              orderBy: { name: "asc" },
              select: { name: true },
            }),
            tone: "error",
          })
        );
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: { seriesId: stored.seriesId, status: "pendente" },
        data: {
          status,
          approvedAt: new Date(),
          ...(chosenLab ? { labId: chosenLab.id } : {}),
        },
      });

      await tx.reservationApprovalToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
    });

    if (action === "approve") {
      const updatedRows = await loadSeries(stored.seriesId);
      const effectiveLab = chosenLab ?? updatedRows[0]?.lab;

      if (effectiveLab) {
        await prisma.$transaction((tx) =>
          syncScheduleEntries(tx, updatedRows, effectiveLab.id)
        );
      }
    }

    const email = await sendReservationStatusEmail(
      toReservationMail(current),
      action,
      reason
    );

    if (wantsJson(req)) {
      res.json({
        ok: true,
        status,
        message:
          status === "aprovada"
            ? "Reserva aprovada com sucesso."
            : "Reserva recusada com sucesso.",
        emailSent: email.sent,
        emailError: email.sent ? undefined : email.error,
      });
      return;
    }

    sendPage(
      res,
      200,
      approvalPage({
        title: status === "aprovada" ? "Reserva aprovada" : "Reserva recusada",
        message:
          status === "aprovada"
            ? "A reserva foi aprovada e o professor foi avisado por e-mail."
            : "A reserva foi recusada e o professor foi avisado por e-mail.",
        tone: status === "aprovada" ? "success" : "error",
      })
    );
  })
);

router.get(
  "/reservations",
  authRequired,
  asyncHandler(async (req, res) => {
    const canManage = req.user!.role === "secretaria" || req.user!.role === "admin";
    const rows = await prisma.reservation.findMany({
      where: canManage ? {} : { professorId: req.user!.id },
      include: reservationInclude,
      orderBy: [{ createdAt: "desc" }, { weekday: "asc" }],
      take: 500,
    });

    res.json({ reservations: groupReservations(rows) });
  })
);

router.get(
  "/admin/reservations",
  authRequired,
  asyncHandler(async (req, res) => {
    const canManage = req.user!.role === "secretaria" || req.user!.role === "admin";

    if (!canManage) {
      throw new AppError(403, "Acesso restrito a administracao.");
    }

    const status = String(req.query.status ?? "").trim().toLowerCase();
    const allowed = ["pendente", "aprovada", "recusada", "cancelada"];

    if (status && !allowed.includes(status)) {
      throw new AppError(400, "Status de reserva invalido.");
    }

    const rows = await prisma.reservation.findMany({
      where: status ? { status: status as ReservationStatus } : {},
      include: reservationInclude,
      orderBy: [{ createdAt: "desc" }, { weekday: "asc" }],
      take: 500,
    });

    res.json({ reservations: groupReservations(rows) });
  })
);

router.post(
  "/reservations",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = createReservationSchema.parse(req.body);
    const days = parseDays(data);
    const orderIndexes = parsePeriods(data);
    const subjectNames = parseSubjects(data);
    const validFrom = data.validFrom
      ? parseDate(data.validFrom, "validFrom")
      : todayUtc();
    const validUntil = data.validUntil
      ? parseDate(data.validUntil, "validUntil")
      : endOfYearUtc();

    if (validUntil < validFrom) {
      throw new AppError(400, "A data final da vigencia nao pode ser anterior ao inicio.");
    }

    const seriesId = randomUUID();
    const rawToken = randomToken();

    const rows = await prisma.$transaction(
      async (tx) => {
          const lab = data.lab
            ? await tx.lab.findFirst({
                where: {
                  name: { equals: data.lab, mode: "insensitive" },
                  active: true,
                },
              })
            : null;
          if (data.lab && !lab) {
            throw new AppError(404, `Laboratorio nao encontrado: ${data.lab}.`);
          }

          // Turma e obrigatoria: aceita classId ou o nome da turma (cria se nao existir).
          let turma: { id: string; name: string } | null = null;
          if (data.classId) {
            turma = await tx.class.findFirst({
              where: { id: data.classId, active: true },
            });
            if (!turma) {
              throw new AppError(404, "Turma nao encontrada.");
            }
          } else if (data.turma) {
            // Reaproveita a turma existente (qualquer turno) para nao duplicar a lista oficial.
            const existing = await tx.class.findFirst({
              where: { name: data.turma },
              orderBy: { shift: "asc" },
            });
            turma = existing ?? await tx.class.create({ data: { name: data.turma } });
          } else {
            throw new AppError(400, "Informe a turma que vai ao laboratorio.");
          }


        const periods = await tx.period.findMany({
          where: { orderIndex: { in: orderIndexes }, active: true },
        });

        if (periods.length !== orderIndexes.length) {
          throw new AppError(400, "Uma ou mais aulas informadas nao existem.");
        }

        const subjects = [];

        for (const name of subjectNames) {
          const subject = await tx.subject.upsert({
            where: { name },
            update: { active: true },
            create: { name },
          });
          subjects.push(subject);
        }

        const periodIds = periods.map((period) => period.id);

        for (const weekday of days) {
          const lockKeys = [
            ...(lab ? [`cepk:lab:${lab.id}:${weekday}`] : []),
            `cepk:professor:${req.user!.id}:${weekday}`,
          ].sort();

          for (const key of lockKeys) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
          }

          const conflictWhere: Prisma.ReservationWhereInput = {
            weekday,
            status: { in: ["pendente", "aprovada"] },
            validFrom: { lte: validUntil },
            validUntil: { gte: validFrom },
            periods: { some: { periodId: { in: periodIds } } },
            ...(lab
              ? { OR: [{ labId: lab.id }, { professorId: req.user!.id }] }
              : { professorId: req.user!.id }),
          };

          const conflict = await tx.reservation.findFirst({
            where: conflictWhere,
          });

          if (conflict) {
            throw new AppError(
              409,
              lab
                ? "Ja existe uma reserva para este laboratorio ou professor neste dia e aula."
                : "Ja existe uma reserva para este professor neste dia e aula."
            );
          }
        }

        const created: ReservationRow[] = [];

        for (const weekday of days) {
          const reservation = await tx.reservation.create({
            data: {
              seriesId,
              labId: lab?.id ?? null,
              classId: turma?.id ?? null,
              professorId: req.user!.id,
              createdById: req.user!.id,
              weekday,
              validFrom,
              validUntil,
              status: "pendente",
              notes: data.notes,
              periods: {
                create: periodIds.map((periodId) => ({ periodId })),
              },
              subjects: {
                create: subjects.map((subject) => ({ subjectId: subject.id })),
              },
            },
            include: reservationInclude,
          });

          created.push(reservation);
        }

        await tx.reservationApprovalToken.create({
          data: {
            seriesId,
            tokenHash: sha256(rawToken),
            expiresAt: approvalExpiryDate(),
          },
        });

        return created;
      },
      { timeout: 15_000 }
    );

    const reservation = publicReservationGroup(rows);
    const email = await sendReservationApprovalEmail(
      toReservationMail(reservation),
      rawToken
    );

    res.status(201).json({
      message: "Solicitacao de reserva registrada. Aguarde a autorizacao.",
      reservation,
      emailSent: email.sent,
      emailError: email.sent ? undefined : email.error,
      ...(env.NODE_ENV !== "production" ? { token: rawToken } : {}),
    });
  })
);

router.post(
  "/reservations/:id/approve",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "secretaria" && req.user!.role !== "admin") {
      throw new AppError(403, "Voce nao tem permissao para aprovar reservas.");
    }

    const data = approveReservationSchema.parse(req.body ?? {});
    const target = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      select: { id: true, seriesId: true },
    });

    if (!target) {
      throw new AppError(404, "Reserva nao encontrada.");
    }

    const where = target.seriesId
      ? { seriesId: target.seriesId }
      : { id: target.id };

    const currentRows = await prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy: [{ weekday: "asc" }],
    });

    if (currentRows.length === 0) {
      throw new AppError(404, "Reserva nao encontrada.");
    }

    if (!currentRows.some((row) => row.status === "pendente")) {
      throw new AppError(409, "Esta reserva ja foi processada.");
    }

    const current = currentRows[0];
    const rowIds = currentRows.map((row) => row.id);
    const rowWhere = { id: { in: rowIds } };
    const nextLab = data.lab
      ? await prisma.lab.findFirst({
          where: {
            name: { equals: data.lab, mode: "insensitive" },
            active: true,
          },
        })
      : null;

    if (data.lab && !nextLab) {
      throw new AppError(404, `Laboratorio nao encontrado: ${data.lab}.`);
    }

    if (!current.labId && !nextLab) {
      throw new AppError(
        400,
        "Selecione o laboratorio disponivel antes de aprovar a reserva."
      );
    }

    const changingLab = Boolean(nextLab && nextLab.id !== current.labId);

    if (changingLab && nextLab) {
      const weekdays = Array.from(
        new Set(currentRows.map((row) => row.weekday))
      ).sort((a, b) => a - b);
      const periodIds = Array.from(
        new Set(
          currentRows.flatMap((row) => row.periods.map((item) => item.periodId))
        )
      );

      await prisma.$transaction(
        async (tx) => {
          for (const weekday of weekdays) {
            const lockKeys = [
              `cepk:lab:${nextLab.id}:${weekday}`,
              `cepk:professor:${current.professorId}:${weekday}`,
            ].sort();

            for (const key of lockKeys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
            }

            const conflict = await tx.reservation.findFirst({
              where: {
                weekday,
                status: { in: ["pendente", "aprovada"] },
                validFrom: { lte: current.validUntil },
                validUntil: { gte: current.validFrom },
                OR: [
                  { labId: nextLab.id },
                  { professorId: current.professorId },
                ],
                periods: { some: { periodId: { in: periodIds } } },
                NOT: { id: { in: rowIds } },
              },
              select: { id: true },
            });

            if (conflict) {
              throw new AppError(
                409,
                "O laboratorio escolhido ja possui reserva neste dia e aula."
              );
            }
          }

          await tx.reservation.updateMany({
            where: rowWhere,
            data: {
              labId: nextLab.id,
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
            },
          });

          await tx.reservation.updateMany({
            where: { ...rowWhere, status: "pendente" },
            data: {
              status: "aprovada",
              approvedAt: new Date(),
              approvedById: req.user!.id,
            },
          });
        },
        { timeout: 15_000 }
      );
    } else {
      await prisma.reservation.updateMany({
        where: { ...rowWhere, status: "pendente" },
        data: {
          status: "aprovada",
          approvedAt: new Date(),
          approvedById: req.user!.id,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });
    }

    const rows = await prisma.reservation.findMany({
      where: rowWhere,
      include: reservationInclude,
      orderBy: [{ weekday: "asc" }],
    });
    const effectiveLab = nextLab ?? current.lab;

    if (effectiveLab) {
      await prisma.$transaction((tx) =>
        syncScheduleEntries(tx, rows, effectiveLab.id)
      );
    }

    const reservation = publicReservationGroup(rows);
    const email = await sendReservationStatusEmail(
      toReservationMail(reservation),
      "approve"
    );

    res.json({
      message: "Reserva aprovada com sucesso.",
      reservation,
      emailSent: email.sent,
      emailError: email.sent ? undefined : email.error,
    });
  })
);

router.delete(
  "/reservations/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const target = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      include: reservationInclude,
    });

    if (!target) {
      throw new AppError(404, "Reserva nao encontrada.");
    }

    const canManage =
      req.user!.role === "secretaria" || req.user!.role === "admin";

    if (!canManage && target.professorId !== req.user!.id) {
      throw new AppError(403, "Voce so pode excluir suas proprias reservas.");
    }

    const rows = target.seriesId
      ? await prisma.reservation.findMany({
          where: { seriesId: target.seriesId },
          include: reservationInclude,
        })
      : [target];

    const rowIds = rows.map((row) => row.id);

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (!row.labId) {
          continue;
        }

        const subject = scheduleSubject(row);

        for (const item of row.periods) {
          await tx.scheduleEntry.deleteMany({
            where: {
              labId: row.labId,
              weekday: row.weekday,
              periodId: item.periodId,
              professor: row.professor.name,
              subject,
            },
          });
        }
      }

      if (target.seriesId) {
        await tx.reservationApprovalToken.deleteMany({
          where: { seriesId: target.seriesId },
        });
      }

      await tx.reservation.deleteMany({
        where: { id: { in: rowIds } },
      });
    });

    res.json({
      message: "Reserva excluida com sucesso.",
      id: target.id,
    });
  })
);

router.post(
  "/reservations/:id/reject",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "secretaria" && req.user!.role !== "admin") {
      throw new AppError(403, "Voce nao tem permissao para recusar reservas.");
    }

    const data = rejectReservationSchema.parse(req.body ?? {});
    const target = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      select: { id: true, seriesId: true },
    });

    if (!target) {
      throw new AppError(404, "Reserva nao encontrada.");
    }

    const where = target.seriesId
      ? { seriesId: target.seriesId }
      : { id: target.id };

    await prisma.reservation.updateMany({
      where: { ...where, status: "pendente" },
      data: { status: "recusada", approvedAt: new Date(), approvedById: req.user!.id },
    });

    const rows = await prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy: [{ weekday: "asc" }],
    });
    const reservation = publicReservationGroup(rows);
    const email = await sendReservationStatusEmail(
      toReservationMail(reservation),
      "reject",
      data.reason
    );

    res.json({
      message: "Reserva recusada.",
      reservation,
      emailSent: email.sent,
      emailError: email.sent ? undefined : email.error,
    });
  })
);

export default router;
