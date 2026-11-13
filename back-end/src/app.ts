import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { corsOrigins, env } from "./config/env";
import { AppError } from "./lib/http";
import { errorHandler, notFound } from "./middleware/error";
import adminUserRoutes from "./routes/admin-users";
import authRoutes from "./routes/auth";
import catalogRoutes from "./routes/catalog";
import reservationRoutes from "./routes/reservations";
import scheduleRoutes from "./routes/schedule";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests": env.NODE_ENV === "production" ? [] : null,
        },
      },
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new AppError(403, "Origem não permitida pelo CORS."));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
  });

  app.use("/auth/login", authLimiter);
  app.use("/auth/register", authLimiter);
  app.use("/auth/approval", authLimiter);
  app.use("/reservations/approval", authLimiter);

  app.use("/auth", authRoutes);
  app.use("/admin/users", adminUserRoutes);
  app.use("/", reservationRoutes);
  app.use("/", catalogRoutes);
  app.use("/", scheduleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
