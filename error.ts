import { Prisma } from "@prisma/client";
import { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/http";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Dados inválidos.",
      issues: err.flatten(),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Já existe um registro com estes dados." });
    }

    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro não encontrado." });
    }

    if (err.code === "P2003") {
      return res.status(409).json({ error: "Este registro está em uso e não pode ser removido." });
    }
  }

  console.error(err);

  return res.status(500).json({
    error: env.NODE_ENV === "production" ? "Erro interno do servidor." : String(err),
  });
};
