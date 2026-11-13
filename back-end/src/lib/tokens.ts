import { createHash, randomBytes } from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type AccessPayload = {
  sub: string;
  role: string;
  email: string;
};

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function approvalExpiryDate(): Date {
  return new Date(Date.now() + 48 * 60 * 60 * 1000);
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function signAccessToken(user: { id: string; role: string; email: string }): string {
  return jwt.sign({ role: user.role, email: user.email }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.email !== "string"
  ) {
    throw new Error("Token inválido.");
  }
  return { sub: payload.sub, role: payload.role, email: payload.email };
}
