const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.mock") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const APPROVAL_EMAIL = process.env.APPROVAL_EMAIL || "guilhermekf55@gmail.com";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

async function testResend() {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [APPROVAL_EMAIL],
      subject: "Teste de envio - Agenda CEPK",
      text: "Se você recebeu este e-mail, o Resend do mock CEPK está funcionando.",
      html: "<p>Se você recebeu este e-mail, o <strong>Resend</strong> do mock CEPK está funcionando.</p>"
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && (data.message || (data.error && data.error.message));
    throw new Error(message || "Resend retornou HTTP " + response.status);
  }

  console.log("E-mail de teste enviado via Resend para " + APPROVAL_EMAIL + ".");
  if (data.id) console.log("ID da mensagem: " + data.id);
}

async function testSmtp() {
  const nodemailer = require("nodemailer");

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000
  });

  await transporter.verify();
  console.log("Conexão SMTP validada.");

  const info = await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: APPROVAL_EMAIL,
    subject: "Teste de envio - Agenda CEPK",
    text: "Se você recebeu este e-mail, o SMTP do mock CEPK está funcionando."
  });

  console.log("E-mail de teste enviado via SMTP para " + APPROVAL_EMAIL + ".");
  console.log("ID da mensagem: " + info.messageId);
}

async function main() {
  if (RESEND_API_KEY) {
    return testResend();
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error("Nenhum provedor configurado. Preencha RESEND_API_KEY ou SMTP_PASS no .env.mock.");
    process.exit(1);
  }

  return testSmtp();
}

main().catch((error) => {
  console.error("Falha no envio de teste: " + error.message);
  process.exit(1);
});
