# SIGESC Hotelaria — Relatório de Auditoria (Phase 0) e Fundação (Phase 1)

**Produto:** SIGESC Hotelaria  
**Conceito:** Modern Hospitality Intelligence  
**Repositório:** `elhadjd/HOTEL`  
**Branch:** `cursor/hotelaria-foundation-fcf5`  
**PR:** https://github.com/elhadjd/HOTEL/pull/1  
**Data:** 22 de novembro de 2026 (America/New_York)

---

## 1. Resumo executivo

A inicialização controlada do SIGESC Hotelaria foi concluída nas Phases 0 e 1.

- O repositório `HOTEL` estava vazio e foi tratado como greenfield seguro.
- Os padrões de integração Aggregate foram auditados a partir do **SIGESC Escolar** (fonte principal).
- O **SIGESC Clinic** foi inspecionado apenas como inspiração de domínio — **não** como referência de integração Aggregate.
- A fundação técnica (Next.js, Prisma/PostgreSQL, shell premium, i18n, Auth, RBAC, Aggregate mock) está implementada.
- Integração live com SIGESC permanece **desactivada** por defeito (`SIGESC_AGGREGATE_MODE=mock`).

---

## 2. Phase 0 — Achados da auditoria

### 2.1 Repositórios inspeccionados

| Fonte | Resultado |
|-------|-----------|
| `elhadjd/HOTEL` | Repositório vazio (apenas `README.md`). Greenfield seguro. |
| `elhadjd/SIGESC-ESCOLAR` | **Referência principal Aggregate.** Cliente `getAggregateClient()`, adapters mock/http, criptografia AES-256-GCM, onboarding validate-before-persist, SyncMapping, RBAC seguro na importação. |
| `elhadjd/SIGESC-CLINIC` | SPA Vite/Base44. **Sem cliente Aggregate Multi-Company.** Contém entidade local de Invoice — padrão **não** a copiar. |
| `elhadjd/SIGESC-FOR-DEVELOPERS` | Essencialmente vazio. |
| `SIGESC/SIGESC-HUB` | README vazio. |
| Laravel SIGESC / JOMBE | Owner comercial/fiscal. **Não modificado.** Integração apenas via API Aggregate documentada. |

### 2.2 Contratos Aggregate confirmados (via Escolar)

**Base path:** `{HOST}/api/v1/aggregate/multi-company`  
**Chave:** `mca_…`  
**Headers:** `Authorization: Bearer mca_…` ou `X-Api-Key: mca_…`  
**Hosts allowlisted:** `app.sisgesc.net`, `app.zyvoerp.com` (HTTPS)

| Endpoint | Scope | Estado para Hotelaria |
|----------|-------|------------------------|
| `GET /onboarding` | `onboarding` \| `all` | Confirmado — implementar |
| `GET /users` | `users` \| `all` | Confirmado — implementar |
| `GET/POST/PATCH /customers` | `customers` \| `all` | Confirmado — Phase 5 |
| `GET/POST/PATCH /products` | `products` \| `all` | Confirmado (uso futuro / mapping de tarifas) |
| `/subscriptions`… | `subscriptions` \| `all` | Documentado no Escolar — **não** Phase 1 |
| `/sales`, invoices, payments | — | **Não inventar** sem contrato confirmado |

### 2.3 Riscos identificados

| Risco | Mitigação |
|-------|-----------|
| Inventar endpoints Aggregate | Portar apenas métodos documentados no Escolar; documentar lacunas |
| Duplicar faturação (anti-padrão Clinic) | Sem modelos Invoice/POS; apenas valores operacionais + refs externas |
| Fugas cross-tenant | `institutionId` derivado da sessão; testes de isolamento |
| Double-booking | Transacções + validação de conflitos |
| Modo live activado por acidente | Default `mock` + allowlist de hosts |
| Drift MySQL (Escolar) vs PostgreSQL (Hotelaria) | Schema Prisma explícito para PostgreSQL |

### 2.4 Documentação de arquitectura entregue

- `docs/architecture/PROJECT_ARCHITECTURE.md`
- `docs/architecture/DATABASE_DESIGN.md`
- `docs/architecture/SIGESC_INTEGRATION.md`
- `docs/architecture/SECURITY_MODEL.md`
- `docs/architecture/IMPLEMENTATION_ROADMAP.md`
- Este relatório: `docs/architecture/PHASE0_AUDIT_REPORT.md`

---

## 3. Arquitectura recomendada

### 3.1 Princípios

1. Produto independente (repo, DB, auth, deploy, env).
2. Separação de responsabilidades: Hotelaria = operações hoteleiras; SIGESC = clientes financeiros, faturação, pagamentos, fiscal.
3. Aggregate apenas com contratos documentados; mock por defeito.
4. Isolamento multi-tenant server-side.
5. Lógica de negócio em módulos/serviços — não em componentes UI.
6. UX premium de hospitalidade (não admin genérico).

### 3.2 Stack decidida

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 15 App Router + React 19 + TypeScript strict |
| UI | Tailwind CSS 4 + tokens CSS (ink/navy, teal, neutros quentes) |
| i18n | next-intl — pt (default), en, fr, es |
| DB | PostgreSQL + Prisma 6 |
| Auth | Auth.js (NextAuth v5) |
| Integração | `getAggregateClient()` + mock/http |
| Testes | Vitest |

### 3.3 Estrutura de directórios (proposta e implementada)

```
HOTEL/
├── docs/architecture/
├── prisma/
├── messages/          # pt, en, fr, es
├── src/
│   ├── app/[locale]/…
│   ├── app/api/v1/…
│   ├── components/
│   ├── modules/
│   │   ├── iam/
│   │   ├── tenancy/
│   │   ├── reporting/
│   │   └── sigesc-integration/
│   ├── server/
│   └── shared/
└── docker-compose.yml
```

---

## 4. Modelo de dados (visão)

Entidades principais:

- **Tenant/IAM:** Institution, User, Role, Permission, Membership, Session
- **Hotel:** Hotel, HotelSettings, RoomCategory, Room (ocupação / housekeeping / manutenção separados)
- **Ops:** Reservation, ReservationRoom, ReservationGuest, Stay, CheckInRecord, CheckOutRecord
- **Guest:** Guest, GuestDocument, GuestCustomerMapping
- **Ops diárias:** HousekeepingTask, MaintenanceRequest
- **Tarifas:** RatePlan, SeasonalRate
- **Integração:** AggregateConnection, AggregateSyncRun, SyncMapping, AuditLog, Notification

Regras críticas:

- IDs UUID
- `institutionId` em todas as tabelas de negócio
- Guest operacional ≠ Customer financeiro SIGESC
- Check-out financeiro nunca marcado como concluído sem confirmação remota

---

## 5. Fluxo de autenticação e onboarding

```
Landing → Login | Onboarding Aggregate

Onboarding:
  1. Utilizador cola chave mca_… (nunca localStorage)
  2. Backend valida formato + GET /onboarding ANTES de persistir
  3. Resolve empresa autorizada
  4. TX: Institution + Hotel + SyncMapping + AggregateConnection (chave encriptada)
  5. Importa users como INVITED com role segura (sem auto-admin)
  6. Redirect → /dashboard
```

Sessões Hotelaria são independentes das passwords SIGESC (nunca importadas).

---

## 6. Achados do contrato de integração SIGESC

### Implementável imediatamente (mock)

- Cliente Aggregate único (`getAggregateClient`)
- Onboarding + sync de users (mock)
- Encriptação AES-256-GCM da chave
- Mapping Guest ↔ Customer (estrutura local)
- Dashboard e operações hoteleiras locais

### Requer staging Aggregate autorizado

- Modo HTTP live contra hosts allowlisted
- Declaração de “integração produção concluída”
- Confirmação financeira de check-out (invoice/sale) via endpoints confirmados

### Lacunas explícitas (não simular como produção)

- Contrato específico Hotelaria para emissão de factura de estadia
- Webhooks de pagamento (Escolar ainda usa polling)
- Clinic não fornece padrão Aggregate reutilizável

---

## 7. Modelo de segurança (síntese)

- RBAC server-side (`module.action`)
- Tenant derivado da membership activa — nunca de `company_id` do browser
- Chaves Aggregate encriptadas; só `keyPrefix` no frontend
- Host Aggregate allowlisted (anti-SSRF)
- AuditLog em connect Aggregate e mutações sensíveis
- Import Aggregate nunca promove automaticamente a `hotel_admin`

---

## 8. Roadmap de implementação

| Phase | Estado | Conteúdo |
|-------|--------|----------|
| 0 — Auditoria | **Concluída** | Audit + docs de arquitectura |
| 1 — Fundação | **Concluída** | Next.js, Prisma, shell, auth, RBAC, Aggregate mock, testes |
| 2 — Onboarding institucional | Seguinte | UI/API onboarding endurecida, status da conexão, sync users |
| 3 — Operações hoteleiras | Planeada | Hotéis, categorias, quartos, hóspedes, reservas, calendário |
| 4 — Operações diárias | Planeada | Check-in/out, housekeeping, manutenção |
| 5 — Integração comercial SIGESC | Planeada | Customers + handoff financeiro só com contratos confirmados |
| 6 — Reporting & hardening | Planeada | Relatórios, testes de concorrência, produção |

---

## 9. Decisões de tecnologia e dependências

| Pacote | Decisão |
|---------|---------|
| next | 15.5.x |
| react | 19.x |
| prisma / @prisma/client | 6.19.x |
| next-auth | 5 beta (Auth.js) |
| next-intl | 3.x |
| zod | 3.24.x |
| vitest | 2.x |
| tailwindcss | 4.x |
| bcryptjs | 3.x |

---

## 10. O que pode ser implementado já vs o que precisa de API externa

### Pode implementar-se imediatamente

- Fundação completa (já entregue)
- Operações hoteleiras locais (hotéis, quartos, reservas, housekeeping, etc.)
- Onboarding Aggregate em modo **mock**
- Métricas operacionais do dashboard a partir da BD
- Testes de isolamento tenant e conflitos de reserva

### Requer suporte / staging externo

- Live Aggregate HTTP validado
- Fluxo oficial de faturação/pagamento pós check-out
- Declaração de integração produção com SIGESC

---

## 11. Phase 1 — Entregáveis concretos

### Design system e shell

- Tokens: ink/navy, teal, neutros quentes
- Sidebar + topbar + empty states
- Landing premium full-bleed
- Tipografia: Libre Baskerville + Source Sans 3

### Backend / dados

- Schema Prisma PostgreSQL completo (fundação)
- Migração inicial aplicada
- Seed de demonstração
- Docker Compose para Postgres

### Integração

- `src/modules/sigesc-integration/`
- Mock adapter com fixtures Hotelaria
- HTTP adapter (documentado; desactivado por defeito)
- `POST /api/v1/onboarding/connect`
- `GET /api/v1/health`

### Qualidade

- Vitest: **10/10** testes a passar (crypto, allowlist, mock)
- `tsc --noEmit` OK
- `next build` OK
- Smoke: `/api/v1/health` e `/dashboard`

### Credenciais de demonstração (seed)

- Email: `admin@hotelaria.demo`
- Password: `HotelariaDemo1!`
- Mock Aggregate key: `mca_mockvalidkeyforonboardingtestsxxxxxx`

---

## 12. Como arrancar localmente

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

---

## 13. Conclusão

O SIGESC Hotelaria fica estabelecido como produto independente, com arquitectura alinhada ao padrão Aggregate do Escolar, sem duplicar responsabilidades comerciais/fiscais do SIGESC, e com fundação técnica pronta para as Phases 2–4 de operações hoteleiras.

**Estado actual:** Phase 0 + Phase 1 concluídas · Aggregate live **não** declarado · PR #1 aberta para revisão.
