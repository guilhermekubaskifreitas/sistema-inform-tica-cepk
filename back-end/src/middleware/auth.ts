import { Role } from "@prisma/client";
import { RequestHandler } from "express";
import { AppError, asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/tokens";

export const authRequired = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Não autenticado.");
  }

  let payload;

  try {
    payload = verifyAccessToken(header.slice(7).trim());
  } catch {
    throw new AppError(401, "Sessão expirada. Faça login novamente.");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user) {
    throw new AppError(401, "Sessão inválida.");
  }

  if (user.status !== "aprovado") {
    throw new AppError(403, "Cadastro não aprovado.");
  }

  req.user = {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  };

  next();
});

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Não autenticado."));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Você não tem permissão para esta ação."));
    }

    next();
  };
}
