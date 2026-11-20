# 💻 Sistema de Agendamento dos Laboratórios de Informática

> **Colégio Estadual Presidente Kennedy (CEPK)** 🏫  
> Plataforma web para gerenciamento e reserva semanal dos laboratórios de informática (Lab 1, Lab 2 e Lab 3).

---

## 🎯 Visão Geral

O sistema substitui controles manuais (cadernos e planilhas) por uma **agenda digital compartilhada**, garantindo agilidade para os professores e controle administrativo para a secretaria.

* **Autonomia com Segurança:** Professores realizam suas próprias reservas com validação automática contra conflitos de horário, turma ou laboratório.
* **Controle Administrativo:** A secretaria aprova cadastros institucionais (`@escola.pr.gov.br`), gerencia bloqueios (manutenção, provas, eventos) e emite relatórios.
* **Reservas Recorrentes:** Agendamentos semanais vinculados a um período de vigência (bimestre/semestre), com opção de cancelar a série completa ou apenas uma semana específica.

---

## 🗺️ Fluxograma do Sistema

📌 **Acesse o fluxograma completo do projeto aqui:**  
👉 [**Visualizar Fluxograma do Sistema**](INSIRA_AQUI_O_LINK_DO_SEU_FLUXOGRAMA)

---

## 👥 Perfis de Acesso & Funcionalidades

| Perfil | Principais Permissões |
| :--- | :--- |
| **👩‍💼 Secretária / Admin** | Aprovar/recusar cadastros e reservas, gerenciar bloqueios, cadastrar labs/turmas/disciplinas, configurar períodos letivos, acessar relatórios (CSV/PDF) e logs de auditoria. |
| **👨‍🏫 Professor** | Autocadastro com e-mail institucional, criar/editar/cancelar suas próprias reservas semanais e acompanhar o status em *"Minhas Reservas"*. |

---

## ⚙️ Regras Principais do Sistema

1. **Bloqueio de Conflitos:** Impede reservas simultâneas para o mesmo laboratório, professor ou turma no mesmo dia e período.
2. **Prioridade de Bloqueios:** Horários bloqueados para manutenção ou eventos têm prioridade e sinalizam reservas sobrepostas.
3. **Validação Institucional:** Cadastro restrito ao domínio `@escola.pr.gov.br` com aprovação prévia da secretaria.
4. **Rastreabilidade:** Todas as alterações e exclusões geram registros completos de auditoria.

---

## 🛠️ Stack Tecnológica

* 🎨 **Frontend:** HTML5 • CSS3 • JavaScript (Vanilla) • PWA (manifest.json + Service Worker) • Google Fonts (Inter) • Render Static Site
* ⚙️ **Backend:** Node.js • Express • TypeScript • Prisma ORM • Zod • bcryptjs • jsonwebtoken • cookie-parser • cors • helmet • express-rate-limit • morgan • dotenv • Nodemailer • Resend • tsx • Render Web Service
* 🗄️ **Banco de Dados:** PostgreSQL • Neon • Prisma Migrate • Prisma Client
* 🔒 **Segurança:** bcrypt • JWT (Access + Refresh) • Cookies (httpOnly / Secure / SameSite) • Helmet (CSP) • CORS (Allowlist) • express-rate-limit • Zod • Validação de Domínio (@escola.pr.gov.br) • Token de Aprovação (Hash + Expiração) • HTTPS/TLS • Variáveis de Ambiente (Secrets)
