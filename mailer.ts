import nodemailer, { Transporter } from "nodemailer";
import { env, parseEmailList } from "../config/env";

type MailUser = {
  name: string;
  email: string;
};

type MailResult = {
  sent: boolean;
  error?: string;
};

type ApprovalAction = "approve" | "reject";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type ResendResponse = {
  id?: string;
  message?: string;
  error?: {
    message?: string;
  };
};

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) {
    return transporter;
  }

  if (!env.SMTP_HOST) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });

  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function approvalLinks(token: string) {
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");
  const encoded = encodeURIComponent(token);
  return {
    approve: `${base}/auth/approval?token=${encoded}&action=approve`,
    reject: `${base}/auth/approval?token=${encoded}&action=reject`,
  };
}

function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

async function sendResendMail(input: MailInput): Promise<MailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as ResendResponse;

    if (!response.ok) {
      const message = data.message || data.error?.message || `Resend retornou HTTP ${response.status}`;
      console.error(`Falha ao enviar e-mail para ${input.to}:`, message);
      return { sent: false, error: message };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao enviar e-mail.";
    console.error(`Falha ao enviar e-mail para ${input.to}:`, message);
    return { sent: false, error: message };
  }
}

async function sendMail(input: MailInput): Promise<MailResult> {
  if (resendConfigured()) {
    return sendResendMail(input);
  }

  const transport = getTransporter();

  if (!transport) {
    return { sent: false, error: "Nenhum provedor de e-mail configurado." };
  }

  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao enviar e-mail.";
    console.error(`Falha ao enviar e-mail para ${input.to}:`, message);
    return { sent: false, error: message };
  }
}

export async function sendApprovalEmail(
  user: MailUser & { subjects: string[]; requestedAdmin?: boolean },
  token: string
): Promise<MailResult> {
  const links = approvalLinks(token);
  const approveHtml = escapeHtml(links.approve);
  const rejectHtml = escapeHtml(links.reject);
  const name = escapeHtml(user.name);
  const email = escapeHtml(user.email);
  const subjects = user.subjects.map(escapeHtml).join(", ") || "Não informada";
  const profile = user.requestedAdmin
    ? "Administrador / responsável pelo agendamento"
    : "Professor(a)";
  const subject = user.requestedAdmin
    ? "Acesso administrativo na Agenda CEPK aguardando aprovação"
    : "Cadastro na Agenda CEPK aguardando aprovação";

  const text = [
    `Olá, ${user.name}.`,
    "",
    "Recebemos uma solicitação de cadastro na Agenda dos Laboratórios CEPK.",
    `E-mail: ${user.email}`,
    `Perfil solicitado: ${profile}`,
    `Disciplinas: ${subjects}`,
    "",
    "Para aprovar, acesse:",
    links.approve,
    "",
    "Para recusar, acesse:",
    links.reject,
    "",
    "Este link é pessoal e expira em 48 horas.",
  ].join("\n");

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
                <tr>
                  <td style="background:#0f3d66;padding:24px 32px;color:#ffffff;">
                    <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Agenda dos Laboratórios</div>
                    <div style="font-size:26px;font-weight:700;margin-top:4px;">CEPK</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="margin:0 0 12px;font-size:22px;color:#0f3d66;">${user.requestedAdmin ? "Solicitação de acesso administrativo" : "Solicitação de cadastro"}</h1>
                    <p style="margin:0 0 20px;line-height:1.6;">Olá, <strong>${name}</strong>. Recebemos uma solicitação de cadastro na Agenda dos Laboratórios CEPK.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#64748b;width:110px;">E-mail</td>
                        <td style="padding:6px 0;font-size:14px;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#64748b;">Perfil</td>
                        <td style="padding:6px 0;font-size:14px;">${profile}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#64748b;">Disciplinas</td>
                        <td style="padding:6px 0;font-size:14px;">${subjects}</td>
                      </tr>
                    </table>
                    <p style="margin:0 0 20px;line-height:1.6;">Confirme a decisão abaixo. O link é pessoal e expira em <strong>48 horas</strong>.</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="padding-right:10px;">
                          <a href="${approveHtml}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">Aprovar cadastro</a>
                        </td>
                        <td>
                          <a href="${rejectHtml}" style="display:inline-block;background:#ffffff;color:#b42318;text-decoration:none;font-weight:700;padding:12px 22px;border:2px solid #b42318;border-radius:10px;">Recusar</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.5;">Se os botões não funcionarem, copie e cole um dos links:</p>
                    <p style="margin:0 0 4px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${approveHtml}" style="color:#0f3d66;">${approveHtml}</a></p>
                    <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${rejectHtml}" style="color:#0f3d66;">${rejectHtml}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                    Se você não solicitou este cadastro, ignore esta mensagem.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  if (!resendConfigured() && !getTransporter() && env.NODE_ENV !== "production") {
    console.warn(
      `[E-mail não configurado] Aprovação de ${user.email}:\nAprovar: ${links.approve}\nRecusar: ${links.reject}`
    );
  }

  const recipients = parseEmailList(env.APPROVAL_EMAIL || env.ADMIN_EMAIL);

  if (!recipients.length) {
    console.warn(
      `[APPROVAL_EMAIL nao configurado] Aprovacao de ${user.email}:\nAprovar: ${links.approve}\nRecusar: ${links.reject}`
    );
    return { sent: false, error: "APPROVAL_EMAIL nao configurado." };
  }

  return sendToRecipients(recipients, { subject, text, html });
}

export async function sendUserStatusEmail(
  user: MailUser,
  action: ApprovalAction,
  reason?: string
): Promise<MailResult> {
  const approved = action === "approve";
  const name = escapeHtml(user.name);
  const subject = approved
    ? "Seu cadastro na Agenda CEPK foi aprovado"
    : "Seu cadastro na Agenda CEPK foi recusado";

  const text = approved
    ? [
        `Olá, ${user.name}.`,
        "",
        "Seu cadastro na Agenda dos Laboratórios CEPK foi aprovado.",
        `Acesse o sistema em: ${env.APP_URL}`,
        "",
        "Se você não reconhece este cadastro, procure a secretaria.",
      ].join("\n")
    : [
        `Olá, ${user.name}.`,
        "",
        "Seu cadastro na Agenda dos Laboratórios CEPK foi recusado.",
        reason ? `Motivo: ${reason}` : "",
        "",
        "Procure a secretaria para mais informações.",
      ]
        .filter((line) => line !== "")
        .join("\n");

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
                <tr>
                  <td style="background:${approved ? "#0f3d66" : "#7a271a"};padding:24px 32px;color:#ffffff;">
                    <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Agenda dos Laboratórios</div>
                    <div style="font-size:26px;font-weight:700;margin-top:4px;">CEPK</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="margin:0 0 12px;font-size:22px;color:${approved ? "#0f3d66" : "#7a271a"};">Cadastro ${approved ? "aprovado" : "recusado"}</h1>
                    <p style="margin:0 0 16px;line-height:1.6;">Olá, <strong>${name}</strong>.</p>
                    <p style="margin:0 0 20px;line-height:1.6;">
                      ${
                        approved
                          ? "Seu cadastro na Agenda dos Laboratórios CEPK foi aprovado. Você já pode entrar no sistema."
                          : "Seu cadastro na Agenda dos Laboratórios CEPK foi recusado."
                      }
                    </p>
                    ${
                      !approved && reason
                        ? `<div style="background:#fef3f2;border:1px solid #fecdca;border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:14px;"><strong>Motivo:</strong> ${escapeHtml(reason)}</div>`
                        : ""
                    }
                    ${
                      approved
                        ? `<a href="${env.APP_URL}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">Acessar a agenda</a>`
                        : `<p style="margin:0;line-height:1.6;">Procure a secretaria para mais informações.</p>`
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                    Esta é uma mensagem automática da Agenda CEPK.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  if (!resendConfigured() && !getTransporter()) {
    console.warn(`[E-mail não configurado] Cadastro ${approved ? "aprovado" : "recusado"}: ${user.email}`);
  }

  return sendMail({ to: user.email, subject, text, html });
}

async function sendToRecipients(
  recipients: string[],
  input: Omit<MailInput, "to">
): Promise<MailResult> {
  const unique = Array.from(new Set(recipients.map((item) => item.trim()).filter(Boolean)));
  let sent = false;
  let error: string | undefined;

  for (const to of unique) {
    const result = await sendMail({ ...input, to });
    if (result.sent) {
      sent = true;
    } else {
      error ??= result.error;
    }
  }

  return sent ? { sent: true } : { sent: false, error: error ?? "Nenhum destinatario configurado." };
}

export type ReservationMail = {
  lab: string;
  professor: string;
  professorEmail: string;
  dia: string;
  turno: string;
  aulas: string;
  disciplinas: string;
  validFrom?: string;
  validUntil?: string;
};

function reservationApprovalLinks(token: string) {
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");
  const encoded = encodeURIComponent(token);
  return {
    approve: `${base}/reservations/approval?token=${encoded}&action=approve`,
    reject: `${base}/reservations/approval?token=${encoded}&action=reject`,
  };
}

function reservationLines(reservation: ReservationMail): string[] {
  return [
    `Solicitado por: ${reservation.professor}`,
    `E-mail: ${reservation.professorEmail}`,
    `Laboratorio: ${reservation.lab}`,
    `Dia: ${reservation.dia}`,
    `Turno: ${reservation.turno}`,
    `Aulas: ${reservation.aulas}`,
    `Disciplinas: ${reservation.disciplinas || "Nao informadas"}`,
    reservation.validFrom ? `Vigencia: ${reservation.validFrom} a ${reservation.validUntil}` : "",
  ].filter(Boolean);
}

function reservationTableHtml(reservation: ReservationMail): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;width:130px;">Solicitado por</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.professor)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">E-mail</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.professorEmail)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Laboratorio</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.lab)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Dia</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.dia)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Turno</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.turno)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Aulas</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.aulas)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Disciplinas</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.disciplinas || "Nao informadas")}</td></tr>
      ${
        reservation.validFrom
          ? `<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Vigencia</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(reservation.validFrom)} a ${escapeHtml(reservation.validUntil ?? "")}</td></tr>`
          : ""
      }
    </table>`;
}

export async function sendReservationApprovalEmail(
  reservation: ReservationMail,
  token: string
): Promise<MailResult> {
  const recipients = parseEmailList(
    env.RESERVATION_EMAIL || env.APPROVAL_EMAIL || env.ADMIN_EMAIL
  );
  const links = reservationApprovalLinks(token);

  if (!recipients.length) {
    console.warn(
      `[RESERVATION_EMAIL nao configurado] Reserva de ${reservation.professorEmail}:\nAprovar: ${links.approve}\nRecusar: ${links.reject}`
    );
    return { sent: false, error: "RESERVATION_EMAIL nao configurado." };
  }

  const subject = `Autorizacao de reserva - ${reservation.lab}`;
  const text = [
    "O sistema Agenda dos Laboratorios CEPK registrou uma nova solicitacao de reserva.",
    "",
    ...reservationLines(reservation),
    "",
    "Aprovar reserva:",
    links.approve,
    "",
    "Recusar reserva:",
    links.reject,
    "",
    "A reserva esta pendente de autorizacao da secretaria.",
  ].join("\n");

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
              <tr><td style="background:#0f3d66;padding:24px 32px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Agenda dos Laboratorios</div>
                <div style="font-size:26px;font-weight:700;margin-top:4px;">CEPK</div>
              </td></tr>
              <tr><td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:22px;color:#0f3d66;">Nova reserva aguardando aprovacao</h1>
                <p style="margin:0 0 20px;line-height:1.6;">O sistema registrou uma nova solicitacao de reserva.</p>
                ${reservationTableHtml(reservation)}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:24px;"><tr>
                  <td style="padding-right:10px;"><a href="${escapeHtml(links.approve)}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">Aprovar reserva</a></td>
                  <td><a href="${escapeHtml(links.reject)}" style="display:inline-block;background:#ffffff;color:#b42318;text-decoration:none;font-weight:700;padding:12px 22px;border:2px solid #b42318;border-radius:10px;">Recusar</a></td>
                </tr></table>
                <p style="margin:0 0 4px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(links.approve)}" style="color:#0f3d66;">${escapeHtml(links.approve)}</a></p>
                <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(links.reject)}" style="color:#0f3d66;">${escapeHtml(links.reject)}</a></p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`;

  return sendToRecipients(recipients, { subject, text, html });
}

export async function sendReservationStatusEmail(
  reservation: ReservationMail,
  action: ApprovalAction,
  reason?: string
): Promise<MailResult> {
  const approved = action === "approve";
  const subject = approved
    ? `Reserva aprovada - ${reservation.lab}`
    : `Reserva recusada - ${reservation.lab}`;
  const text = [
    `Ola, ${reservation.professor}.`,
    "",
    approved
      ? "Sua reserva foi aprovada pela secretaria."
      : "Sua reserva foi recusada pela secretaria.",
    "",
    ...reservationLines(reservation),
    reason ? `Motivo: ${reason}` : "",
    "",
    `Acesse o sistema em: ${env.APP_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
              <tr><td style="background:${approved ? "#0f3d66" : "#7a271a"};padding:24px 32px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Agenda dos Laboratorios</div>
                <div style="font-size:26px;font-weight:700;margin-top:4px;">CEPK</div>
              </td></tr>
              <tr><td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:22px;color:${approved ? "#0f3d66" : "#7a271a"};">Reserva ${approved ? "aprovada" : "recusada"}</h1>
                <p style="margin:0 0 20px;line-height:1.6;">Ola, <strong>${escapeHtml(reservation.professor)}</strong>.</p>
                ${reservationTableHtml(reservation)}
                ${
                  !approved && reason
                    ? `<div style="background:#fef3f2;border:1px solid #fecdca;border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:14px;"><strong>Motivo:</strong> ${escapeHtml(reason)}</div>`
                    : ""
                }
                <a href="${escapeHtml(env.APP_URL)}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">Acessar a agenda</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`;

  return sendMail({ to: reservation.professorEmail, subject, text, html });
}
