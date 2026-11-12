const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
try { require("dotenv").config({ path: ".env.mock" }); } catch (error) {}
try { require("dotenv").config(); } catch (error) {}

const PORT = Number(process.env.MOCK_PORT || process.env.PORT || 3000);
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "";
const APP_URL = process.env.APP_URL || "http://localhost:5500";
const API_PUBLIC_URL = process.env.API_PUBLIC_URL || RENDER_URL || "http://localhost:" + PORT;
const APPROVAL_EMAIL = process.env.APPROVAL_EMAIL || "guilhermekf55@gmail.com";
const RESERVATION_EMAIL = process.env.RESERVATION_EMAIL || APPROVAL_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";
const USE_FORMSUBMIT = process.env.USE_FORMSUBMIT === "true";
const ADMIN_NAME = process.env.ADMIN_NAME || "Secretaria Teste";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "secretaria@escola.pr.gov.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "senha123";

function emailRecipients(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

const users = new Map();
const approvalTokens = new Map();
const reservationApprovalTokens = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const reservations = [];
const scheduleEntries = [];

const MOCK_PERIODS = [
  { id: "per-1", label: "1ª aula", shift: "manha", startTime: "07:30", endTime: "08:20", orderIndex: 1, active: true },
  { id: "per-2", label: "2ª aula", shift: "manha", startTime: "08:20", endTime: "09:10", orderIndex: 2, active: true },
  { id: "per-3", label: "3ª aula", shift: "manha", startTime: "09:10", endTime: "10:00", orderIndex: 3, active: true },
  { id: "per-4", label: "4ª aula", shift: "manha", startTime: "10:20", endTime: "11:10", orderIndex: 4, active: true },
  { id: "per-5", label: "5ª aula", shift: "manha", startTime: "11:10", endTime: "12:00", orderIndex: 5, active: true },
  { id: "per-6", label: "6ª aula", shift: "tarde", startTime: "13:00", endTime: "13:50", orderIndex: 6, active: true },
  { id: "per-7", label: "7ª aula", shift: "tarde", startTime: "13:50", endTime: "14:40", orderIndex: 7, active: true },
  { id: "per-8", label: "8ª aula", shift: "tarde", startTime: "14:40", endTime: "15:30", orderIndex: 8, active: true },
  { id: "per-9", label: "9ª aula", shift: "tarde", startTime: "15:50", endTime: "16:40", orderIndex: 9, active: true },
  { id: "per-10", label: "10ª aula", shift: "tarde", startTime: "16:40", endTime: "17:30", orderIndex: 10, active: true },
  { id: "per-11", label: "11ª aula", shift: "noite", startTime: "19:00", endTime: "19:50", orderIndex: 11, active: true },
  { id: "per-12", label: "12ª aula", shift: "noite", startTime: "19:50", endTime: "20:40", orderIndex: 12, active: true }
];

const MOCK_SUBJECTS = [
  "Matemática",
  "Português",
  "História",
  "Geografia",
  "Ciências",
  "Biologia",
  "Física",
  "Química",
  "Filosofia",
  "Sociologia",
  "Arte",
  "Educação Física",
  "Inglês",
  "Espanhol",
  "Informática",
  "Programação",
  "Robótica",
  "Redes",
  "Banco de Dados",
  "Empreendedorismo"
].map((name, index) => ({ id: `sub-${index + 1}`, name, active: true }));

const MOCK_CLASSES = [
  "1º Ano A",
  "1º Ano B",
  "2º Ano A",
  "2º Ano B",
  "3º Ano A",
  "3º Ano B"
].map((name, index) => ({ id: `cls-${index + 1}`, name, active: true }));

const DEFAULT_LABS = [
  { id: "lab-1", name: "Lab 1", location: "Bloco A", studentCapacity: 40, pcCount: 40, notes: "" },
  { id: "lab-2", name: "Lab 2", location: "Bloco A", studentCapacity: 35, pcCount: 35, notes: "" },
  { id: "lab-3", name: "Lab 3", location: "Bloco B", studentCapacity: 30, pcCount: 30, notes: "" }
];

const labs = DEFAULT_LABS.map((lab) => {
  const now = new Date().toISOString();
  return { ...lab, active: true, createdAt: now, updatedAt: now };
});

const MOCK_DATA_FILE = (() => {
  const configured = process.env.MOCK_DATA_FILE;
  if (configured === "false" || configured === "off") return "";
  if (configured) return path.resolve(configured);
  return path.join(__dirname, "..", ".mock-data.json");
})();

function loadMockData() {
  if (!MOCK_DATA_FILE) return;
  let raw;
  try {
    raw = fs.readFileSync(MOCK_DATA_FILE, "utf8");
  } catch (error) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.users)) {
      users.clear();
      parsed.users.forEach((user) => {
        if (user && user.email) users.set(String(user.email).toLowerCase(), user);
      });
    }
    if (Array.isArray(parsed.reservations)) {
      reservations.length = 0;
      reservations.push(...parsed.reservations);
    }
    if (Array.isArray(parsed.scheduleEntries)) {
      scheduleEntries.length = 0;
      scheduleEntries.push(...parsed.scheduleEntries);
    }
    if (Array.isArray(parsed.labs) && parsed.labs.length) {
      labs.length = 0;
      labs.push(...parsed.labs);
    }
  } catch (error) {
    console.warn("Mock: arquivo de dados inválido, ignorando.", error.message);
  }
}

function saveMockData() {
  if (!MOCK_DATA_FILE) return;
  const payload = {
    users: Array.from(users.values()),
    reservations,
    scheduleEntries,
    labs,
    savedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(MOCK_DATA_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn("Mock: não foi possível gravar os dados.", error.message);
  }
}

const MOCK_WEEKDAYS = {
  segunda: 1,
  terça: 2,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5
};

function reservationWeekdays(reservation) {
  const list = Array.isArray(reservation.dias)
    ? reservation.dias
    : String(reservation.dia || "").split(/[,;\n]/);
  return Array.from(
    new Set(
      list
        .map((item) => MOCK_WEEKDAYS[String(item).trim().toLowerCase()])
        .filter(Boolean)
    )
  );
}

function reservationPeriods(reservation) {
  const list = Array.isArray(reservation.aulas)
    ? reservation.aulas
    : String(reservation.aula || "").split(/[,;\n]/);
  return Array.from(
    new Set(
      list
        .map((item) => {
          const match = String(item).match(/\d+/);
          return match ? Number(match[0]) : null;
        })
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
    )
  );
}

function syncMockSchedule(reservation) {
  if (!reservation.lab || reservation.lab === "A definir") return;

  const subject =
    (Array.isArray(reservation.disciplinas) && reservation.disciplinas.join(", ")) ||
    reservation.disciplina ||
    "A definir";

  for (const weekday of reservationWeekdays(reservation)) {
    for (const period of reservationPeriods(reservation)) {
      const existing = scheduleEntries.find(
        (entry) =>
          entry.lab === reservation.lab &&
          Number(entry.weekday) === weekday &&
          Number(entry.period) === period
      );

      if (existing) {
        existing.professor = reservation.professor;
        existing.subject = subject;
        existing.updatedAt = new Date().toISOString();
      } else {
        scheduleEntries.push({
          id: id("sch"),
          lab: reservation.lab,
          weekday,
          period,
          professor: reservation.professor,
          subject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }
}

function removeMockSchedule(reservation) {
  if (!reservation.lab || reservation.lab === "A definir") return;

  const subject =
    (Array.isArray(reservation.disciplinas) && reservation.disciplinas.join(", ")) ||
    reservation.disciplina ||
    "A definir";

  for (const weekday of reservationWeekdays(reservation)) {
    for (const period of reservationPeriods(reservation)) {
      const index = scheduleEntries.findIndex(
        (entry) =>
          entry.lab === reservation.lab &&
          Number(entry.weekday) === weekday &&
          Number(entry.period) === period &&
          entry.professor === reservation.professor &&
          entry.subject === subject
      );

      if (index >= 0) scheduleEntries.splice(index, 1);
    }
  }
}

function id(prefix) {
  return prefix + "_" + crypto.randomUUID().slice(0, 8);
}

function addUser(input) {
  const email = String(input.email || "").trim().toLowerCase();
  users.set(email, {
    id: input.id || id("usr"),
    name: input.name,
    email,
    password: input.password,
    role: input.role || "professor",
    status: input.status || "pendente",
    subjects: input.subjects || []
  });
  return users.get(email);
}

addUser({
  id: "usr_professor",
  name: "Professor Teste",
  email: "professor@escola.pr.gov.br",
  password: "senha123",
  role: "professor",
  status: "aprovado",
  subjects: ["Matemática"]
});

addUser({
  id: "usr_secretaria",
  name: ADMIN_NAME,
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  role: "secretaria",
  status: "aprovado",
  subjects: ["Secretaria"]
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    subjects: user.subjects
  };
}

function normalizeLabInput(body, current) {
  const base = current || {};
  const pickString = (value, fallback) => (value === undefined ? fallback : String(value || "").trim());
  const pickInt = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
  };
  return {
    name: pickString(body.name, base.name || ""),
    location: pickString(body.location, base.location || ""),
    studentCapacity: pickInt(body.studentCapacity, typeof base.studentCapacity === "number" ? base.studentCapacity : 0),
    pcCount: pickInt(body.pcCount, typeof base.pcCount === "number" ? base.pcCount : 0),
    notes: pickString(body.notes, base.notes || ""),
    active: body.active === undefined ? base.active !== false : Boolean(body.active)
  };
}

function labInUse(name) {
  const normalized = String(name || "").toLowerCase();
  return (
    reservations.some((reservation) => String(reservation.lab || "").toLowerCase() === normalized) ||
    scheduleEntries.some((entry) => String(entry.lab || "").toLowerCase() === normalized)
  );
}

function approvalLinks(token) {
  const approveParams = new URLSearchParams({ token, action: "approve" });
  const rejectParams = new URLSearchParams({ token, action: "reject" });
  return {
    approve: API_PUBLIC_URL + "/auth/approval?" + approveParams.toString(),
    reject: API_PUBLIC_URL + "/auth/approval?" + rejectParams.toString()
  };
}

function reservationApprovalLinks(token) {
  const approveParams = new URLSearchParams({ token, action: "approve" });
  const rejectParams = new URLSearchParams({ token, action: "reject" });
  return {
    approve: API_PUBLIC_URL + "/reservations/approval?" + approveParams.toString(),
    reject: API_PUBLIC_URL + "/reservations/approval?" + rejectParams.toString()
  };
}

function approvalMessage(user, links) {
  return [
    "Olá!",
    "",
    "O sistema Agenda dos Laboratórios CEPK registrou um novo cadastro que aguarda autorização.",
    "",
    "Nome: " + user.name,
    "E-mail: " + user.email,
    "Disciplinas: " + (user.subjects.join(", ") || "Não informadas"),
    "",
    "Aprovar cadastro:",
    links.approve,
    "",
    "Recusar cadastro:",
    links.reject,
    "",
    "Se o link não funcionar, copie e cole no navegador."
  ].join("\n");
}

function smtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function resendConfigured() {
  return Boolean(RESEND_API_KEY);
}

function emailProvider() {
  if (resendConfigured()) return "resend";
  if (smtpConfigured()) return "smtp";
  if (USE_FORMSUBMIT) return "formsubmit";
  return "";
}

async function sendResendMail(options) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: RESEND_FROM,
        to: emailRecipients(options.to || APPROVAL_EMAIL),
        reply_to: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return { sent: true, error: "" };
    }

    const message = data && (data.message || (data.error && data.error.message));
    return { sent: false, error: message || "Resend retornou HTTP " + response.status };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

async function sendSmtpMail(options) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (error) {
    return { sent: false, error: "Nodemailer não está instalado no backend." };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15000
  });

  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: emailRecipients(options.to || APPROVAL_EMAIL).join(", "),
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text,
      html: options.html
    });
    return { sent: true, error: "" };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

async function sendEmail(options) {
  const provider = emailProvider();
  if (provider === "resend") return sendResendMail(options);
  if (provider === "smtp") return sendSmtpMail(options);
  return {
    sent: false,
    error: "Nenhum provedor de e-mail configurado. Defina RESEND_API_KEY ou SMTP_USER/SMTP_PASS."
  };
}

async function sendProviderApprovalEmail(user, links) {
  const message = approvalMessage(user, links);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937">
      <h2 style="color:#0f3d66">Novo cadastro aguardando aprovação</h2>
      <p>O sistema Agenda dos Laboratórios CEPK registrou uma nova solicitação.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0"><strong>Nome</strong></td><td>${escapeHtml(user.name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>E-mail</strong></td><td>${escapeHtml(user.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Disciplinas</strong></td><td>${escapeHtml(user.subjects.join(", ") || "Não informadas")}</td></tr>
      </table>
      <p style="margin-top:24px">
        <a href="${escapeHtml(links.approve)}" style="display:inline-block;padding:12px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px">Aprovar cadastro</a>
        <a href="${escapeHtml(links.reject)}" style="display:inline-block;padding:12px 18px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;margin-left:8px">Recusar cadastro</a>
      </p>
      <p style="font-size:12px;color:#64748b">Se os botões não funcionarem, copie e cole os links no navegador.</p>
    </div>
  `;

  return sendEmail({
    to: APPROVAL_EMAIL,
    replyTo: user.email,
    subject: "Autorização de cadastro — " + user.name,
    text: message,
    html
  });
}

async function sendFormSubmitApprovalEmail(user, links) {
  const message = approvalMessage(user, links);

  try {
    const response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(APPROVAL_EMAIL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        _subject: "Autorização de cadastro — " + user.name,
        _template: "table",
        _captcha: "false",
        email: user.email,
        nome: user.name,
        disciplinas: user.subjects.join(", "),
        mensagem: message
      })
    });
    const data = await response.json().catch(() => ({}));
    const sent = response.ok && String(data.success) !== "false";
    return { sent, error: sent ? "" : (data.message || "FormSubmit retornou HTTP " + response.status) };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

async function sendApprovalEmail(user, token) {
  const links = approvalLinks(token);
  if (resendConfigured() || smtpConfigured()) {
    return sendProviderApprovalEmail(user, links);
  }
  if (USE_FORMSUBMIT) {
    return sendFormSubmitApprovalEmail(user, links);
  }
  return {
    sent: false,
    error: "Nenhum provedor configurado. Defina RESEND_API_KEY ou SMTP_USER/SMTP_PASS."
  };
}

function reservationApprovalMessage(reservation, links) {
  return [
    "Olá!",
    "",
    "O sistema Agenda dos Laboratórios CEPK registrou uma nova solicitação de reserva que aguarda autorização.",
    "",
    "Solicitado por: " + reservation.professor,
    "E-mail: " + reservation.professorEmail,
    "Laboratório: " + reservation.lab,
    "Dia: " + reservation.dia,
    "Turno: " + reservation.turno,
    "Aulas: " + reservation.aulas.join(", "),
    "Disciplinas: " + (reservation.disciplinas.join(", ") || "Não informadas"),
    "",
    "Aprovar reserva:",
    links.approve,
    "",
    "Recusar reserva:",
    links.reject,
    "",
    "A reserva está pendente de autorização da secretaria."
  ].join("\n");
}

async function sendReservationEmail(reservation, token) {
  const links = reservationApprovalLinks(token);
  const message = reservationApprovalMessage(reservation, links);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937">
      <h2 style="color:#0f3d66">Nova reserva aguardando aprovação</h2>
      <p>O sistema Agenda dos Laboratórios CEPK registrou uma nova solicitação de reserva.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0"><strong>Solicitado por</strong></td><td>${escapeHtml(reservation.professor)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>E-mail</strong></td><td>${escapeHtml(reservation.professorEmail)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Laboratório</strong></td><td>${escapeHtml(reservation.lab)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Dia</strong></td><td>${escapeHtml(reservation.dia)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Turno</strong></td><td>${escapeHtml(reservation.turno)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Aulas</strong></td><td>${escapeHtml(reservation.aulas.join(", "))}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Disciplinas</strong></td><td>${escapeHtml(reservation.disciplinas.join(", ") || "Não informadas")}</td></tr>
      </table>
      <p style="margin-top:24px">
        <a href="${escapeHtml(links.approve)}" style="display:inline-block;padding:12px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px">Aprovar reserva</a>
        <a href="${escapeHtml(links.reject)}" style="display:inline-block;padding:12px 18px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;margin-left:8px">Recusar reserva</a>
      </p>
      <p style="font-size:12px;color:#64748b">Se os botões não funcionarem, copie e cole os links no navegador.</p>
    </div>
  `;

  return sendEmail({
    to: RESERVATION_EMAIL,
    replyTo: reservation.professorEmail,
    subject: "Autorização de reserva — " + reservation.lab,
    text: message,
    html
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html)
  });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Corpo da requisição muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function currentUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const email = accessTokens.get(token);
  return email ? users.get(email) : null;
}

function layout(title, content) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Mock CEPK</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f6fb;color:#1f2937;font-family:Arial,Helvetica,sans-serif}
    .card{width:100%;max-width:560px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.12)}
    .top{padding:22px 28px;background:#0f3d66;color:#fff}
    .top small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
    .top strong{display:block;margin-top:3px;font-size:24px}
    .content{padding:28px}
    h1{margin:0 0 12px;font-size:23px;color:#0f3d66}
    p{line-height:1.6}
    dl{display:grid;grid-template-columns:120px 1fr;gap:8px 12px;margin:18px 0}
    dt{font-weight:bold;color:#475569}
    dd{margin:0;color:#0f172a;word-break:break-word}
    .actions{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}
    button{border:0;border-radius:10px;padding:12px 18px;font-size:14px;font-weight:bold;cursor:pointer}
    .approve{background:#16a34a;color:#fff}
    .reject{background:#dc2626;color:#fff}
    a{color:#0f3d66}
  </style>
</head>
<body>
  <main class="card">
    <div class="top"><small>Mock local</small><strong>Agenda CEPK</strong></div>
    <div class="content">${content}</div>
  </main>
</body>
</html>`;
}

function approvalPage(user, token, message, isError) {
  const tone = isError ? "#b91c1c" : "#0f3d66";
  if (message && !user) {
    return layout(
      isError ? "Link inválido" : "Aprovação",
      `<h1 style="color:${tone}">${escapeHtml(isError ? "Não foi possível aprovar" : "Aprovação de cadastro")}</h1>
       <p>${escapeHtml(message)}</p>
       <p><a href="${escapeHtml(APP_URL)}/login.html">Ir para o login</a></p>`
    );
  }

  return layout(
    "Aprovação de cadastro",
    `<h1>Aprovação de cadastro</h1>
     <p>Analise a solicitação abaixo.</p>
     <dl>
       <dt>Nome</dt><dd>${escapeHtml(user.name)}</dd>
       <dt>E-mail</dt><dd>${escapeHtml(user.email)}</dd>
       <dt>Disciplinas</dt><dd>${escapeHtml(user.subjects.join(", ") || "Não informadas")}</dd>
       <dt>Status</dt><dd>${escapeHtml(user.status)}</dd>
     </dl>
     <form method="post" action="/auth/approval">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <div class="actions">
         <button class="approve" type="submit" name="action" value="approve">Aprovar cadastro</button>
         <button class="reject" type="submit" name="action" value="reject">Recusar cadastro</button>
       </div>
     </form>`
  );
}

function resultPage(user, approved) {
  const title = approved ? "Cadastro aprovado" : "Cadastro recusado";
  const message = approved
    ? "O professor já pode entrar pelo login."
    : "O professor deverá solicitar um novo cadastro mais tarde.";
  return layout(
    title,
    `<h1 style="color:${approved ? "#15803d" : "#b91c1c"}">${title}</h1>
     <p>${escapeHtml(user.name)} (${escapeHtml(user.email)})</p>
     <p>${message}</p>
     <p><a href="${escapeHtml(APP_URL)}/login.html">Abrir tela de login</a></p>`
  );
}

function reservationApprovalPage(reservation, token, message, isError) {
  if (message && !reservation) {
    return layout(
      isError ? "Link inválido" : "Aprovação de reserva",
      `<h1 style="color:${isError ? "#b91c1c" : "#0f3d66"}">${escapeHtml(isError ? "Não foi possível processar a reserva" : "Aprovação de reserva")}</h1>
       <p>${escapeHtml(message)}</p>
       <p><a href="${escapeHtml(APP_URL)}/login.html">Ir para o login</a></p>`
    );
  }

  return layout(
    "Aprovação de reserva",
    `<h1>Aprovação de reserva</h1>
     <p>Analise a solicitação abaixo.</p>
     <dl>
       <dt>Solicitado por</dt><dd>${escapeHtml(reservation.professor)}</dd>
       <dt>E-mail</dt><dd>${escapeHtml(reservation.professorEmail)}</dd>
       <dt>Laboratório</dt><dd>${escapeHtml(reservation.lab)}</dd>
       <dt>Dia</dt><dd>${escapeHtml(reservation.dia)}</dd>
       <dt>Turno</dt><dd>${escapeHtml(reservation.turno)}</dd>
       <dt>Aulas</dt><dd>${escapeHtml(reservation.aulas.join(", "))}</dd>
       <dt>Disciplinas</dt><dd>${escapeHtml(reservation.disciplinas.join(", ") || "Não informadas")}</dd>
       <dt>Status</dt><dd>${escapeHtml(reservation.status)}</dd>
     </dl>
     <form method="post" action="/reservations/approval">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <div class="actions">
         <button class="approve" type="submit" name="action" value="approve">Aprovar reserva</button>
         <button class="reject" type="submit" name="action" value="reject">Recusar reserva</button>
       </div>
     </form>`
  );
}

function reservationResultPage(reservation, approved) {
  const title = approved ? "Reserva aprovada" : "Reserva recusada";
  const message = approved
    ? "A reserva foi autorizada pela secretaria."
    : "A reserva foi recusada pela secretaria.";
  return layout(
    title,
    `<h1 style="color:${approved ? "#15803d" : "#b91c1c"}">${title}</h1>
     <p>${escapeHtml(reservation.professor)} — ${escapeHtml(reservation.lab)}, ${escapeHtml(reservation.dia)}, ${escapeHtml(reservation.turno)}.</p>
     <p>${message}</p>
     <p><a href="${escapeHtml(APP_URL)}/visualizacao-reservas.html">Ver reservas</a></p>`
  );
}

function validationError(res, fields) {
  return sendJson(res, 400, {
    error: "Dados inválidos.",
    issues: { formErrors: [], fieldErrors: fields }
  });
}

function loginResponse(res, user) {
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const refreshCookie = "cepk_refresh=" + encodeURIComponent(refreshToken) + "; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=604800";
  accessTokens.set(accessToken, user.email);
  refreshTokens.set(refreshToken, user.email);
  res.setHeader("Set-Cookie", refreshCookie);
  return sendJson(res, 200, { accessToken, user: publicUser(user) });
}

async function handle(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return sendJson(res, 200, { status: "ok", mock: true, timestamp: new Date().toISOString() });
  }

  if (req.method === "GET" && path === "/catalog") {
    return sendJson(res, 200, {
      labs: labs.filter((lab) => lab.active !== false),
      periods: MOCK_PERIODS,
      subjects: MOCK_SUBJECTS,
      classes: MOCK_CLASSES
    });
  }

  if (req.method === "GET" && path === "/labs") {
    const user = currentUser(req);
    const includeInactive = String(url.searchParams.get("includeInactive") || "") === "true";
    const isStaff = Boolean(user && (user.role === "secretaria" || user.role === "admin"));
    const visible = includeInactive && isStaff ? labs : labs.filter((lab) => lab.active !== false);
    return sendJson(res, 200, { labs: visible });
  }

  if (req.method === "GET" && path === "/periods") {
    return sendJson(res, 200, { periods: MOCK_PERIODS });
  }

  if (req.method === "GET" && path === "/subjects") {
    return sendJson(res, 200, { subjects: MOCK_SUBJECTS });
  }

  if (req.method === "GET" && path === "/classes") {
    return sendJson(res, 200, { classes: MOCK_CLASSES });
  }

  if (req.method === "POST" && path === "/labs") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Apenas a administração pode cadastrar laboratórios." : "Sessão inválida."
      });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const normalized = normalizeLabInput(body, null);
    const fields = {};
    if (normalized.name.length < 2 || normalized.name.length > 80) {
      fields.name = ["Informe um nome entre 2 e 80 caracteres."];
    } else if (labs.some((lab) => lab.name.toLowerCase() === normalized.name.toLowerCase())) {
      fields.name = ["Já existe um laboratório com este nome."];
    }
    if (Object.keys(fields).length) return validationError(res, fields);

    const now = new Date().toISOString();
    const lab = { id: id("lab"), ...normalized, createdAt: now, updatedAt: now };
    labs.push(lab);
    return sendJson(res, 201, { lab });
  }

  const labMatch = path.match(/^\/labs\/([^/]+)$/);
  if (req.method === "PUT" && labMatch) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Apenas a administração pode editar laboratórios." : "Sessão inválida."
      });
    }

    const current = labs.find((lab) => lab.id === labMatch[1]);
    if (!current) return sendJson(res, 404, { error: "Laboratório não encontrado." });

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const normalized = normalizeLabInput(body, current);
    const fields = {};
    if (normalized.name.length < 2 || normalized.name.length > 80) {
      fields.name = ["Informe um nome entre 2 e 80 caracteres."];
    } else if (
      labs.some(
        (lab) => lab.id !== current.id && lab.name.toLowerCase() === normalized.name.toLowerCase()
      )
    ) {
      fields.name = ["Já existe um laboratório com este nome."];
    }
    if (Object.keys(fields).length) return validationError(res, fields);

    Object.assign(current, normalized, { updatedAt: new Date().toISOString() });
    return sendJson(res, 200, { lab: current });
  }

  if (req.method === "DELETE" && labMatch) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Apenas a administração pode excluir laboratórios." : "Sessão inválida."
      });
    }

    const index = labs.findIndex((lab) => lab.id === labMatch[1]);
    if (index < 0) return sendJson(res, 404, { error: "Laboratório não encontrado." });

    if (labInUse(labs[index].name)) {
      return sendJson(res, 409, {
        error: "Este laboratório possui reservas ou horários vinculados. Desative-o em vez de excluir."
      });
    }

    labs.splice(index, 1);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && path === "/admin/users") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Acesso restrito à administração." : "Sessão inválida."
      });
    }

    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    let list = Array.from(users.values());
    if (status) list = list.filter((item) => String(item.status || "").toLowerCase() === status);
    if (query) {
      list = list.filter(
        (item) =>
          String(item.name || "").toLowerCase().includes(query) ||
          String(item.email || "").toLowerCase().includes(query)
      );
    }
    list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    return sendJson(res, 200, { users: list.map(publicUser) });
  }

  const adminUserAction = path.match(/^\/admin\/users\/([^/]+)\/(approve|reject)$/);
  if (req.method === "POST" && adminUserAction) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Acesso restrito à administração." : "Sessão inválida."
      });
    }

    const target = Array.from(users.values()).find((item) => item.id === adminUserAction[1]);
    if (!target) return sendJson(res, 404, { error: "Usuário não encontrado." });
    if (target.role === "admin" && user.role !== "admin") {
      return sendJson(res, 403, { error: "Apenas um administrador pode alterar outro administrador." });
    }

    const action = adminUserAction[2];
    target.status = action === "approve" ? "aprovado" : "recusado";

    for (const [token, email] of approvalTokens.entries()) {
      if (email === target.email) approvalTokens.delete(token);
    }

    return sendJson(res, 200, {
      message: action === "approve" ? "Cadastro aprovado." : "Cadastro recusado.",
      user: publicUser(target)
    });
  }

  const adminUserDelete = path.match(/^\/admin\/users\/([^/]+)$/);
  if (req.method === "DELETE" && adminUserDelete) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || user.role !== "admin") {
      return sendJson(res, user ? 403 : 401, {
        error: user ? "Apenas administradores podem excluir usuários." : "Sessão inválida."
      });
    }

    const target = Array.from(users.values()).find((item) => item.id === adminUserDelete[1]);
    if (!target) return sendJson(res, 404, { error: "Usuário não encontrado." });
    if (target.id === user.id) {
      return sendJson(res, 409, { error: "Você não pode excluir o próprio usuário." });
    }

    users.delete(target.email);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && path === "/auth/register") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const fields = {};
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((item) => String(item).trim()).filter(Boolean)
      : String(body.subject || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
    const adminRequested = Boolean(body.adminRequest);

    if (name.length < 3) fields.name = ["Informe seu nome completo."];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) fields.email = ["E-mail inválido."];
    if (password.length < 8) fields.password = ["A senha deve ter ao menos 8 caracteres."];
    if (!adminRequested && subjects.length === 0) fields.subjects = ["Informe ao menos uma disciplina."];
    if (Object.keys(fields).length) return validationError(res, fields);

    const existing = users.get(email);
    if (existing && existing.status === "aprovado") {
      return sendJson(res, 409, { error: "Este e-mail já possui cadastro aprovado. Faça login." });
    }

    const user = addUser({
      id: existing ? existing.id : id("usr"),
      name,
      email,
      password,
      role: adminRequested ? "admin" : "professor",
      status: "pendente",
      subjects
    });

    const token = crypto.randomUUID();
    approvalTokens.set(token, email);
    const emailResult = await sendApprovalEmail(user, token);
    const links = approvalLinks(token);

    console.log("Link de aprovação:", links.approve);
    if (!emailResult.sent) console.warn("E-mail não enviado:", emailResult.error);

    return sendJson(res, 201, {
      message: adminRequested
        ? "Solicitação de acesso administrativo registrada. Aguarde a validação da secretaria."
        : "Solicitação registrada. Aguarde a aprovação da secretaria.",
      admin: false,
      requestedAdmin: adminRequested,
      requiresApproval: true,
      user: publicUser(user),
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      token
    });
  }

  if (req.method === "GET" && path === "/auth/approval") {
    const token = url.searchParams.get("token") || "";
    const action = String(url.searchParams.get("action") || "approve").toLowerCase();
    const email = approvalTokens.get(token);
    const user = email ? users.get(email) : null;

    if (!token) return sendHtml(res, 400, approvalPage(null, "", "Token de aprovação ausente.", true));
    if (!user) return sendHtml(res, 404, approvalPage(null, "", "Link de aprovação inválido ou já utilizado.", true));

    if (action === "approve" || action === "reject") {
      return sendHtml(res, 200, approvalPage(user, token));
    }

    return sendHtml(res, 400, approvalPage(null, "", "Ação de aprovação inválida.", true));
  }

  if (req.method === "POST" && path === "/auth/approval") {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const token = params.get("token") || "";
    const action = params.get("action") || "";
    const email = approvalTokens.get(token);
    const user = email ? users.get(email) : null;

    if (!token || !user) {
      return sendHtml(res, 404, approvalPage(null, "", "Link de aprovação inválido ou já utilizado.", true));
    }

    if (action !== "approve" && action !== "reject") {
      return sendHtml(res, 400, approvalPage(null, "", "Ação de aprovação inválida.", true));
    }

    user.status = action === "approve" ? "aprovado" : "recusado";
    approvalTokens.delete(token);

    return sendHtml(res, 200, resultPage(user, action === "approve"));
  }

  if (req.method === "POST" && path === "/auth/login") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = users.get(email);

    if (!user || user.password !== password) {
      return sendJson(res, 401, { error: "E-mail ou senha inválidos." });
    }

    if (user.status === "pendente") {
      return sendJson(res, 403, { error: "Seu cadastro está aguardando aprovação da secretaria." });
    }

    if (user.status === "recusado") {
      return sendJson(res, 403, { error: "Seu cadastro foi recusado. Procure a secretaria." });
    }

    return loginResponse(res, user);
  }

  if (req.method === "POST" && path === "/auth/refresh") {
    const refreshToken = parseCookie(req, "cepk_refresh");
    const email = refreshTokens.get(refreshToken);
    const user = email ? users.get(email) : null;

    if (!refreshToken || !user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessão expirada. Faça login novamente." });
    }

    const accessToken = crypto.randomUUID();
    accessTokens.set(accessToken, user.email);
    return sendJson(res, 200, { accessToken, user: publicUser(user) });
  }

  if (req.method === "POST" && path === "/auth/logout") {
    const refreshToken = parseCookie(req, "cepk_refresh");
    refreshTokens.delete(refreshToken);
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) accessTokens.delete(auth.slice(7));
    res.setHeader("Set-Cookie", "cepk_refresh=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0");
    return sendJson(res, 200, { message: "Sessão encerrada." });
  }

  if (req.method === "GET" && path === "/auth/me") {
    const user = currentUser(req);
    if (!user) return sendJson(res, 401, { error: "Sessão inválida." });
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (req.method === "GET" && path === "/schedule") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessão inválida." });
    }
    return sendJson(res, 200, { entries: scheduleEntries });
  }

  if ((req.method === "PUT" || req.method === "DELETE") && path === "/schedule") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessão inválida." });
    }
    if (user.role !== "secretaria" && user.role !== "admin") {
      return sendJson(res, 403, { error: "Apenas a secretaria pode editar a grade." });
    }

    let body = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    let lab;
    let weekday;
    let period;

    if (req.method === "DELETE") {
      const params = new URLSearchParams(url.search);
      lab = String(params.get("lab") || "").trim();
      weekday = Number(params.get("weekday"));
      period = Number(params.get("period"));
      const index = scheduleEntries.findIndex(
        (entry) =>
          entry.lab === lab &&
          Number(entry.weekday) === weekday &&
          Number(entry.period) === period
      );
      if (index >= 0) scheduleEntries.splice(index, 1);
      return sendJson(res, 200, { ok: true });
    }

    lab = String(body.lab || "").trim();
    weekday = Number(body.weekday);
    period = Number(body.period);
    const professor = String(body.professor || "").trim();
    const subject = String(body.subject || "").trim();

    if (!lab || !Number.isInteger(weekday) || weekday < 1 || weekday > 5 || !Number.isInteger(period) || period < 1 || period > 12 || !professor || !subject) {
      return sendJson(res, 400, { error: "Informe laboratório, dia, aula, professor e matéria." });
    }

    let entry = scheduleEntries.find(
      (item) =>
        item.lab === lab &&
        Number(item.weekday) === weekday &&
        Number(item.period) === period
    );

    if (entry) {
      entry.professor = professor;
      entry.subject = subject;
      entry.updatedAt = new Date().toISOString();
    } else {
      entry = {
        id: id("sch"),
        lab,
        weekday,
        period,
        professor,
        subject,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      scheduleEntries.push(entry);
    }

    return sendJson(res, 200, { entry });
  }

  const reservationAction = path.match(/^\/reservations\/([^/]+)\/(approve|reject)$/);
  if (req.method === "POST" && reservationAction) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessão inválida." });
    }
    if (user.role !== "secretaria" && user.role !== "admin") {
      return sendJson(res, 403, { error: "Apenas a secretaria pode aprovar reservas." });
    }

    let body = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const reservation = reservations.find((item) => item.id === reservationAction[1]);
    if (!reservation) {
      return sendJson(res, 404, { error: "Solicitação não encontrada." });
    }

    const action = reservationAction[2];
    if (action === "approve") {
      const lab = String(body.lab || reservation.lab || "").trim();
      if (!lab || lab === "A definir") return sendJson(res, 400, { error: "Informe o laboratório." });
      reservation.lab = lab;
      reservation.status = "aprovada";
      syncMockSchedule(reservation);
    } else {
      reservation.status = "recusada";
      if (body.reason) reservation.reason = String(body.reason);
    }

    reservation.decidedAt = new Date().toISOString();
    reservation.decidedBy = user.email;

    return sendJson(res, 200, {
      message: action === "approve" ? "Reserva aprovada." : "Reserva recusada.",
      reservation
    });
  }

  if (req.method === "GET" && path === "/reservations/approval") {
    const token = url.searchParams.get("token") || "";
    const action = String(url.searchParams.get("action") || "approve").toLowerCase();
    const reservationId = reservationApprovalTokens.get(token);
    const reservation = reservationId
      ? reservations.find((item) => item.id === reservationId)
      : null;

    if (!token) {
      return sendHtml(res, 400, reservationApprovalPage(null, "", "Token de aprovação ausente.", true));
    }
    if (!reservation) {
      return sendHtml(res, 404, reservationApprovalPage(null, "", "Link de aprovação inválido ou já utilizado.", true));
    }
    if (reservation.status !== "pendente") {
      return sendHtml(res, 200, reservationResultPage(reservation, reservation.status === "aprovada"));
    }
    if (action !== "approve" && action !== "reject") {
      return sendHtml(res, 400, reservationApprovalPage(null, "", "Ação de aprovação inválida.", true));
    }

    return sendHtml(res, 200, reservationApprovalPage(reservation, token));
  }

  if (req.method === "POST" && path === "/reservations/approval") {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const token = params.get("token") || "";
    const action = params.get("action") || "";
    const reservationId = reservationApprovalTokens.get(token);
    const reservation = reservationId
      ? reservations.find((item) => item.id === reservationId)
      : null;

    if (!token || !reservation) {
      return sendHtml(res, 404, reservationApprovalPage(null, "", "Link de aprovação inválido ou já utilizado.", true));
    }
    if (reservation.status !== "pendente") {
      return sendHtml(res, 200, reservationResultPage(reservation, reservation.status === "aprovada"));
    }
    if (action !== "approve" && action !== "reject") {
      return sendHtml(res, 400, reservationApprovalPage(null, "", "Ação de aprovação inválida.", true));
    }

    if (action === "approve" && (!reservation.lab || reservation.lab === "A definir")) {
      return sendHtml(
        res,
        400,
        reservationApprovalPage(
          reservation,
          token,
          "A secretaria precisa definir o laboratório no painel administrativo antes de aprovar esta reserva.",
          true
        )
      );
    }

    reservation.status = action === "approve" ? "aprovada" : "recusada";
    if (action === "approve") {
      syncMockSchedule(reservation);
    }
    reservation.decidedAt = new Date().toISOString();
    reservationApprovalTokens.delete(token);

    return sendHtml(res, 200, reservationResultPage(reservation, action === "approve"));
  }

  if (req.method === "GET" && path === "/reservations") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessão inválida." });
    }
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const isStaff = user.role === "secretaria" || user.role === "admin";
    let visible = isStaff
      ? reservations
      : reservations.filter((reservation) => reservation.professorEmail === user.email);
    if (status) {
      visible = visible.filter((reservation) => String(reservation.status || "").toLowerCase() === status);
    }
    return sendJson(res, 200, { reservations: visible });
  }

  if (req.method === "GET" && path === "/admin/reservations") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado" || (user.role !== "secretaria" && user.role !== "admin")) {
      return sendJson(res, user ? 403 : 401, { error: user ? "Acesso restrito à administração." : "Sessão inválida." });
    }
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const visible = status
      ? reservations.filter((reservation) => String(reservation.status || "").toLowerCase() === status)
      : reservations;
    return sendJson(res, 200, { reservations: visible });
  }

  const reservationDelete = path.match(/^\/reservations\/([^/]+)$/);
  if (req.method === "DELETE" && reservationDelete) {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Sessao invalida." });
    }

    const index = reservations.findIndex(
      (item) => item.id === reservationDelete[1]
    );

    if (index < 0) {
      return sendJson(res, 404, { error: "Reserva nao encontrada." });
    }

    const reservation = reservations[index];
    const canManage = user.role === "secretaria" || user.role === "admin";

    if (!canManage && reservation.professorEmail !== user.email) {
      return sendJson(res, 403, {
        error: "Voce so pode excluir suas proprias reservas."
      });
    }

    removeMockSchedule(reservation);
    reservations.splice(index, 1);

    return sendJson(res, 200, {
      message: "Reserva excluida.",
      id: reservation.id
    });
  }

  if (req.method === "POST" && path === "/reservations") {
    const user = currentUser(req);
    if (!user || user.status !== "aprovado") {
      return sendJson(res, 401, { error: "Faça login para solicitar a reserva." });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "JSON inválido." });
    }

    const lab = String(body.lab || "A definir").trim() || "A definir";
    const dia = String(body.dia || "").trim();
    const turno = String(body.turno || "").trim();
    const aulas = Array.isArray(body.aulas)
      ? body.aulas.map((item) => String(item).trim()).filter(Boolean)
      : String(body.aula || "").split(",").map((item) => item.trim()).filter(Boolean);
    const disciplinas = Array.isArray(body.disciplinas)
      ? body.disciplinas.map((item) => String(item).trim()).filter(Boolean)
      : String(body.disciplina || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
    const dias = Array.isArray(body.dias) && body.dias.length
      ? body.dias.map((item) => String(item).trim()).filter(Boolean)
      : String(body.dia || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);

    const fields = {};
    if (!dia) fields.dia = ["Informe o dia."];
    if (!turno) fields.turno = ["Informe o turno."];
    if (aulas.length === 0) fields.aulas = ["Informe ao menos uma aula."];
    if (Object.keys(fields).length) return validationError(res, fields);

    const now = new Date();
    const endOfYear = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));

    const reservation = {
      id: id("res"),
      lab,
      dias,
      dia,
      turno,
      aulas,
      disciplinas,
      professor: user.name,
      professorEmail: user.email,
      status: "pendente",
      validFrom: body.validFrom || now.toISOString().slice(0, 10),
      validUntil: body.validUntil || endOfYear.toISOString().slice(0, 10),
      createdAt: now.toISOString()
    };

    reservations.unshift(reservation);
    const token = crypto.randomUUID();
    reservationApprovalTokens.set(token, reservation.id);
    const emailResult = await sendReservationEmail(reservation, token);
    const links = reservationApprovalLinks(token);

    console.log("Nova reserva:", reservation.lab, reservation.dia, reservation.aulas.join(", "));
    console.log("Link de aprovação da reserva:", links.approve);
    if (!emailResult.sent) console.warn("E-mail de reserva não enviado:", emailResult.error);

    return sendJson(res, 201, {
      message: "Solicitação de reserva registrada. Aguarde a autorização.",
      reservation,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error
    });
  }

  return sendJson(res, 404, { error: "Rota não encontrada." });
}

loadMockData();

const server = http.createServer((req, res) => {
  handle(req, res)
    .then(() => {
      if (req.method !== "GET" && req.method !== "OPTIONS") saveMockData();
    })
    .catch((error) => {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: "Erro interno no mock." });
    });
});

server.listen(PORT, () => {
  console.log("Mock API CEPK em http://localhost:" + PORT);
  console.log("Professor: professor@escola.pr.gov.br / senha123");
  console.log("Admin: " + ADMIN_EMAIL + " / " + ADMIN_PASSWORD);
  console.log("Aprovações serão enviadas para: " + APPROVAL_EMAIL);
  console.log("Reservas serão enviadas para: " + emailRecipients(RESERVATION_EMAIL).join(", "));
  const provider = emailProvider();
  if (provider === "resend") {
    console.log("Envio por Resend: configurado (remetente: " + RESEND_FROM + ")");
  } else if (provider === "smtp") {
    console.log("Envio por SMTP: configurado");
  } else if (provider === "formsubmit") {
    console.log("Envio por FormSubmit: configurado");
  } else {
    console.log("Envio de e-mail: não configurado (links no console)");
  }
});

