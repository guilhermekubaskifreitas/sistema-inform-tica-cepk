import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const labs = [
  { name: "Lab 1", notes: "Ajustar capacidade de alunos e quantidade de PCs com a secretaria." },
  { name: "Lab 2", notes: "Ajustar capacidade de alunos e quantidade de PCs com a secretaria." },
  { name: "Lab 3", notes: "Ajustar capacidade de alunos e quantidade de PCs com a secretaria." },
];

const periods = [
  { label: "1ª aula", shift: "manha" as const, startTime: "07:15", endTime: "08:05", orderIndex: 1 },
  { label: "2ª aula", shift: "manha" as const, startTime: "08:05", endTime: "08:55", orderIndex: 2 },
  { label: "3ª aula", shift: "manha" as const, startTime: "08:55", endTime: "09:45", orderIndex: 3 },
  { label: "4ª aula", shift: "manha" as const, startTime: "10:05", endTime: "10:55", orderIndex: 4 },
  { label: "5ª aula", shift: "manha" as const, startTime: "10:55", endTime: "11:45", orderIndex: 5 },
  { label: "6ª aula", shift: "manha" as const, startTime: "11:45", endTime: "12:35", orderIndex: 6 },
  { label: "7ª aula", shift: "tarde" as const, startTime: "13:00", endTime: "13:50", orderIndex: 7 },
  { label: "8ª aula", shift: "tarde" as const, startTime: "13:50", endTime: "14:40", orderIndex: 8 },
  { label: "9ª aula", shift: "tarde" as const, startTime: "14:40", endTime: "15:25", orderIndex: 9 },
  { label: "10ª aula", shift: "tarde" as const, startTime: "15:45", endTime: "16:35", orderIndex: 10 },
  { label: "11ª aula", shift: "tarde" as const, startTime: "16:35", endTime: "17:25", orderIndex: 11 },
  { label: "12ª aula", shift: "tarde" as const, startTime: "17:25", endTime: "18:10", orderIndex: 12 },
];

const subjects = [
  "Matemática",
  "Português",
  "Química",
  "Biologia",
  "Ciências",
  "Geografia",
  "Física",
  "Filosofia",
  "História",
  "Sociologia",
  "Educação Física",
  "Inglês",
  "Arte",
  "Educação Digital",
  "Banco de Dados",
  "Introdução à Computação",
  "Introdução à Programação",
  "Lógica Computacional",
  "Análise e Métodos para Sistema",
  "Projeto/Outro",
];

async function main() {
  for (const lab of labs) {
    await prisma.lab.upsert({
      where: { name: lab.name },
      update: { notes: lab.notes },
      create: lab,
    });
  }

  for (const period of periods) {
    await prisma.period.upsert({
      where: { shift_orderIndex: { shift: period.shift, orderIndex: period.orderIndex } },
      update: {
        label: period.label,
        startTime: period.startTime,
        endTime: period.endTime,
      },
      create: period,
    });
  }

  for (const name of subjects) {
    await prisma.subject.upsert({
      where: { name },
      update: { active: true },
      create: { name },
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        name: process.env.ADMIN_NAME?.trim() || "Secretaria CEPK",
        passwordHash,
        role: "admin",
        status: "aprovado",
        approvedAt: new Date(),
      },
      create: {
        name: process.env.ADMIN_NAME?.trim() || "Secretaria CEPK",
        email: adminEmail,
        passwordHash,
        role: "admin",
        status: "aprovado",
        approvedAt: new Date(),
      },
    });

    console.log(`Admin garantido: ${adminEmail}`);
  } else {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD não definidos; nenhum admin foi criado.");
  }

  console.log(
    `Seed concluído: ${labs.length} labs, ${periods.length} períodos, ${subjects.length} disciplinas.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
