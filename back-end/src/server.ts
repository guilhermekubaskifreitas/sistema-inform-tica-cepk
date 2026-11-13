import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API CEPK rodando em http://localhost:${env.PORT} (${env.NODE_ENV}).`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Recebido ${signal}. Encerrando a API...`);

  const forceExit = setTimeout(() => {
    console.error("Encerramento forçado após 10 segundos.");
    process.exit(1);
  }, 10_000);

  forceExit.unref();

  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  console.error("Promise rejeitada sem tratamento:", reason);
});
