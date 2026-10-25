# Sistema de Agendamento dos Laboratórios de Informática

**Colégio Estadual Presidente Kennedy (CEPK)**

Plano de desenvolvimento do sistema de reserva de horários dos laboratórios de informática.

---

## 1. Visão geral

Sistema web para que professores e secretaria **reservem semanalmente os laboratórios de informática** (Lab 1, Lab 2 e Lab 3), com controle de conflitos, aprovação de cadastros, bloqueios de manutenção e visualização em grade semanal.

### Objetivos

- Substituir cadernos e planilhas por uma agenda digital compartilhada.
- Eliminar reservas duplicadas para o mesmo laboratório, professor ou turma.
- Dar autonomia ao professor para reservar, com validação automática de conflitos.
- Permitir que a secretaria aprove cadastros e gerencie bloqueios.
- Oferecer acesso externo por link, com autenticação institucional.

### Fora do escopo

- Monitoramento dos computadores ou de atividades de alunos.
- Instalação de agentes nas máquinas.
- Painel público de exibição.
- Lista de espera para horários concorridos.
- Taxa de ocupação nos relatórios.

---

## 2. Decisões confirmadas

| Item | Definição |
|---|---|
| Reservas | Semanais e recorrentes (dia da semana + período + vigência) |
| Visualização | Somente grade semanal |
| Bloqueios | Uma única opção: lab + dia da semana + períodos + vigência + motivo |
| Relatórios | Listagem/exportação de reservas (sem taxa de ocupação) |
| Duração das aulas | 50 minutos (com exceções na 9ª e 12ª aulas da tarde) |
| Turnos | Manhã 07:15–12:35 e tarde 13:00–18:10 |
| Cadastro | Autocadastro do professor com aprovação da secretária |
| Login | E-mail institucional `@escola.pr.gov.br` |
| Hospedagem | VPS |
| Banco de dados | MySQL 8 |

---

## 3. Grade de horários

### Manhã — 07:15 às 12:35

| Período | Horário |
|---|---|
| 1ª aula | 07:15 – 08:05 |
| 2ª aula | 08:05 – 08:55 |
| 3ª aula | 08:55 – 09:45 |
| Intervalo | 09:45 – 10:05 |
| 4ª aula | 10:05 – 10:55 |
| 5ª aula | 10:55 – 11:45 |
| 6ª aula | 11:45 – 12:35 |

### Tarde — 13:00 às 18:10

| Período | Horário |
|---|---|
| 7ª aula | 13:00 – 13:50 |
| 8ª aula | 13:50 – 14:40 |
| 9ª aula | 14:40 – 15:25 *(45 min)* |
| Intervalo | 15:25 – 15:45 |
| 10ª aula | 15:45 – 16:35 |
| 11ª aula | 16:35 – 17:25 |
| 12ª aula | 17:25 – 18:10 *(45 min)* |

**Total:** 12 períodos por dia. Os períodos ficam cadastrados no banco de dados (seed inicial) e podem ser ajustados pela secretária sem alteração de código.

---

## 4. Perfis de acesso

| Perfil | Permissões |
|---|---|
| **Secretária / Administrador** | Aprovar/recusar cadastros, aprovar/recusar reservas, gerenciar bloqueios, cadastros (labs, períodos, turmas, disciplinas, usuários), relatórios, configurações e auditoria |
| **Professor** | Autocadastro, criar/editar/cancelar suas próprias reservas, consultar a grade semanal, ver "minhas reservas" |

---

## 5. Fluxo de autocadastro

1. Professor acessa o link do sistema e preenche nome, e-mail **@escola.pr.gov.br**, senha e disciplina(s).
2. O sistema valida o domínio do e-mail e envia um link de confirmação.
3. O cadastro fica com status **pendente**.
4. A secretária aprova ou recusa (com justificativa).
5. O professor recebe e-mail automático com o resultado.
6. Após aprovação, o professor pode fazer login e reservar.

### Autenticação

- Login por e-mail + senha.
- Senha armazenada com hash (bcrypt).
- Sessão via JWT + refresh token.
- Recuperação de senha por e-mail.
- Domínio institucional validado e configurável (`@escola.pr.gov.br`).

---

## 6. Modelo de reserva semanal

A reserva é um **compromisso semanal com vigência**, não uma data isolada.

> **Exemplo:** Lab 2 · terça-feira · 3ª e 4ª aulas · Prof.ª Maria · 9º A · Matemática · de 10/02/2027 a 30/06/2027

- A grade semanal exibe a reserva em todas as terças dentro da vigência.
- Conflitos são verificados em **todas as semanas** do intervalo antes de gravar.
- Cancelamento pode ser:
  - **da série inteira** (encerra a reserva), ou
  - **apenas de uma semana** (registra uma exceção, mantendo a recorrência).
- Vigência padrão sugerida: início e fim do bimestre/semestre letivo (configurável).

---

## 7. Bloqueios

Único tipo de bloqueio disponível:

> **Bloquear um laboratório em um dia da semana + período, por um intervalo de datas, com motivo obrigatório.**

**Exemplo:** "Lab 1 · sexta-feira · 5ª e 6ª aulas · 01/03 a 30/06 · manutenção dos computadores".

Todos os casos (manutenção, prova, evento, feriado) usam esse mesmo formulário, variando apenas o motivo. Reservas sobrepostas a um bloqueio são sinalizadas para remanejamento.

---

## 8. Regras de negócio

1. Um laboratório só pode ter **uma reserva ativa** por dia da semana + período, considerando a sobreposição de vigências.
2. Um professor não pode ter duas reservas no mesmo dia da semana + período.
3. Uma turma não pode ter duas reservas no mesmo dia da semana + período.
4. Bloqueios têm prioridade; reservas sobrepostas são sinalizadas.
5. Só é possível reservar nos dias letivos e nos períodos cadastrados.
6. A reserva deve estar dentro da vigência do período letivo configurado.
7. Alerta (sem bloquear) se o número de alunos da turma exceder a capacidade do laboratório.
8. Alterações e exclusões de reservas geram registro de auditoria.
9. O professor só edita/cancela **suas próprias** reservas; a secretária pode agir em nome de qualquer professor.
10. A validação de conflito é feita em transação no backend para evitar reservas simultâneas no mesmo horário.

---

## 9. Telas

1. **Login / Recuperação de senha**
2. **Autocadastro de professor** (com confirmação de e-mail)
3. **Aprovação de cadastros** (secretária)
4. **Grade semanal** — tela principal
   - Colunas: segunda a sexta
   - Linhas: 12 períodos (6 manhã + 6 tarde)
   - Abas por laboratório (Lab 1, Lab 2, Lab 3)
   - Cada célula exibe professor, turma, disciplina e cor por status
   - Clique em célula livre abre a nova reserva naquele horário
5. **Nova / editar reserva** — laboratório, dia da semana, períodos, vigência, turma, disciplina e observações; validação de conflito em tempo real
6. **Minhas reservas** — lista com status, edição, cancelamento da série ou de uma semana
7. **Aprovação de reservas** (caso a secretária opte por exigir aprovação)
8. **Bloqueios** — listar, criar e remover
9. **Relatórios** — filtros por laboratório, professor, turma e vigência; exportação CSV/PDF
10. **Cadastros** — laboratórios, períodos, turmas, disciplinas e usuários
11. **Configurações** — vigência letiva, capacidade dos laboratórios, e-mails e domínio institucional

---

## 10. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS + FullCalendar |
| Backend | Node.js + Fastify + TypeScript + Prisma ORM + Zod |
| Autenticação | JWT + refresh token + bcrypt |
| Banco de dados | MySQL 8 |
| Infraestrutura | Docker Compose + Nginx + HTTPS (Let's Encrypt) |
| E-mail | SMTP institucional ou Resend |
| Hospedagem | VPS (2 vCPU / 4 GB RAM / 50 GB SSD) |

### Arquitetura

```
┌─────────────────────────────────────────────┐
│  Frontend: React + Vite + TypeScript        │
│  Tailwind + FullCalendar                    │
└───────────────┬─────────────────────────────┘
                │ HTTPS / REST + JWT
┌───────────────▼─────────────────────────────┐
│  Backend: Node.js + Fastify + TypeScript    │
│  Prisma ORM + Zod + JWT + bcrypt            │
└───────────────┬─────────────────────────────┘
                │
        ┌───────▼────────┐      ┌──────────────┐
        │  MySQL 8       │      │  Fila de     │
        │  (dados)       │      │  e-mails     │
        └────────────────┘      └──────────────┘
```

- HTTPS obrigatório.
- MySQL nunca exposto publicamente.
- Backup diário do banco para armazenamento externo.
- Domínio sugerido: `labs.cepk.escola.pr.gov.br` (a definir).

---

## 11. Modelo de dados

```sql
users (
  id, name, email, password_hash, role, status,
  email_verified_at, approved_by, approved_at, created_at
)

password_resets (
  id, user_id, token_hash, expires_at, used_at
)

labs (
  id, name, location, student_capacity, pc_count, active, notes
)

periods (
  id, label, shift, start_time, end_time, order_index, active
)

classes (
  id, name, grade, shift, student_count, active
)

subjects (
  id, name, active
)

teacher_subjects (
  id, user_id, subject_id, class_id
)

reservations (
  id, lab_id, teacher_id, class_id, subject_id,
  weekday, period_ids,
  valid_from, valid_until,
  status,          -- pendente | aprovada | recusada | cancelada
  notes, created_by, approved_by, approved_at,
  created_at, updated_at
)

reservation_exceptions (
  id, reservation_id, date, type, reason, created_by, created_at
)

blocked_slots (
  id, lab_id, weekday, period_ids,
  valid_from, valid_until,
  reason, created_by, created_at
)

audit_logs (
  id, user_id, action, entity, entity_id,
  before_json, after_json, ip, created_at
)

settings (
  key, value
)
```

**Índices:** `(lab_id, weekday)`, `(teacher_id, weekday)`, `(class_id, weekday)` e `(valid_from, valid_until)`.

---

## 12. API — endpoints principais

```
POST   /auth/register                 # autocadastro
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password

GET    /me

GET    /admin/users?status=pending
POST   /admin/users/:id/approve
POST   /admin/users/:id/reject

GET    /labs
GET    /periods
GET    /classes
GET    /subjects
POST/PUT/DELETE  /labs/:id, /periods/:id, /classes/:id, /subjects/:id

GET    /schedule?labId=&from=&to=     # grade semanal
GET    /reservations?mine=true
POST   /reservations                  # cria série semanal
PUT    /reservations/:id
POST   /reservations/:id/approve
POST   /reservations/:id/reject
DELETE /reservations/:id              # cancela a série
POST   /reservations/:id/exceptions   # cancela apenas uma semana

GET    /blocked-slots
POST   /blocked-slots
DELETE /blocked-slots/:id

GET    /reports/reservations?from=&to=&labId=&teacherId=&classId=
GET    /audit-logs
GET    /settings
PUT    /settings
```

---

## 13. Roadmap

| Fase | Entrega | Prazo estimado |
|---|---|---|
| **1. Fundação** | Monorepo, MySQL/Prisma, login, autocadastro com aprovação, cadastros básicos | 1–2 semanas |
| **2. Núcleo** | Grade semanal, reserva recorrente, validação de conflitos, minhas reservas | 2–3 semanas |
| **3. Bloqueios e moderação** | Bloqueio único, aprovação de reservas, cancelamento por semana | 1 semana |
| **4. Relatórios e acabamento** | Listagens, exportação, auditoria, e-mails, backup | 1 semana |
| **5. Piloto** | Uso real com a secretária e professores, ajustes e manual | 1 semana |

**MVP (fases 1–2):** aproximadamente 3 a 4 semanas.
**Escopo completo:** aproximadamente 6 a 8 semanas.

---

## 14. Estrutura do repositório

```
sistema-inform-tica-cepk/
├── apps/
│   ├── api/          # Fastify + Prisma + JWT
│   └── web/          # React + Vite + FullCalendar
├── packages/
│   └── shared/       # tipos, schemas Zod e regras de conflito
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── scripts/      # backup e seed
├── docs/
│   ├── regras-de-negocio.md
│   └── manual/
├── PLANO.md
└── README.md
```

---

## 15. Pendências a confirmar com a secretária

1. Vigência letiva (datas de início e fim dos bimestres/semestres).
2. Se toda reserva precisa de aprovação da secretária ou apenas o cadastro do professor.
3. Se há aula no sábado.
4. Lista inicial de turmas e disciplinas.
5. Capacidade de alunos e quantidade de PCs de cada laboratório.

---

## 16. Segurança e boas práticas

- HTTPS em todas as conexões.
- Senhas com hash bcrypt.
- Validação de entrada com Zod em todos os endpoints.
- Controle de acesso por perfil (RBAC).
- Registro de auditoria das ações administrativas.
- Backup diário automatizado do MySQL.
- Variáveis sensíveis em `.env`, nunca versionadas.
- Rate limiting em login e recuperação de senha.
