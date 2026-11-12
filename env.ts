import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalAdminEmail = z.preprocess(
  emptyToUndefined,
  z.string().email().optional()
);

const optionalAdminPassword = z.preprocess(
  emptyToUndefined,
  z.string().min(8).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  APP_URL: z.string().url().default("http://localhost:5500"),
  API_PUBLIC_URL: z.string().url().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5500"),
  ALLOWED_EMAIL_DOMAINS: z.string().default("escola.pr.gov.br"),
  APPROVAL_EMAIL: z.string().optional(),
  RESERVATION_EMAIL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Agenda CEPK <no-reply@cepk.local>"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("onboarding@resend.dev"),
  ADMIN_NAME: z.string().default("Secretaria CEPK"),
  ADMIN_EMAIL: optionalAdminEmail,
  ADMIN_PASSWORD: optionalAdminPassword,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuração inválida. Verifique o .env:", parsed.error.flatten().fieldErrors);
  throw new Error("Variáveis de ambiente inválidas.");
}

const data = parsed.data;

export const env = {
  ...data,
  API_PUBLIC_URL:
    data.API_PUBLIC_URL ?? data.RENDER_EXTERNAL_URL ?? `http://localhost:${data.PORT}`,
};

export function parseEmailList(value?: string): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[,;\n]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export const allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS.split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
