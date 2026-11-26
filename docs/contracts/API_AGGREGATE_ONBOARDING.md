# API Aggregate — Onboarding (parceiros: clínica, farmácia, HUB, …)

Documento para a **equipa do produto parceiro** que precisa de iniciar / conectar uma conta a partir de uma empresa que **já existe** no SIGESC / Zyvo ERP — sem criar uma nova conta no sistema principal.

---

## 1. Objectivo

| Cenário | O que fazer |
|---------|-------------|
| Empresa já trabalha no SIGESC (ERP) e quer usar a clínica / farmácia / outro produto irmão | Pedir ao cliente uma chave Aggregate `mca_…` criada no SIGESC e chamar **onboarding** |
| Empresa ainda **não** existe no SIGESC | Criar com `POST /onboarding/register` — ver [`API_AGGREGATE_COMPANY_CREATE.md`](./API_AGGREGATE_COMPANY_CREATE.md) |
| Dados necessários no parceiro | Perfil da empresa + utilizadores de login com nível `admin` / `manager` / `user` |
| Contas já existentes no SIGESC | **Não** criar de novo — reutilizar `external_id` / NIF / email via `GET /onboarding` |

Fluxo recomendado no produto parceiro:

1. Ecrã “Já tenho conta SIGESC / Zyvo” → o cliente cola a chave `mca_…`.
2. O vosso backend chama `GET …/onboarding`.
3. Vocês criam (ou ligam) a organização local com os dados devolvidos e convidam os utilizadores por email (sem password do SIGESC).
4. Guardam a chave para pedidos futuros (catálogo, faturas, webhooks, …).

---

## 2. Autenticação

| Item | Valor |
|------|--------|
| Tipo | Chave Aggregate `mca_…` |
| Onde se cria | SIGESC → **Configurações → API multi-empresa** (Admin ou Manager) |
| Header | `Authorization: Bearer mca_xxxxxxxx…` |
| Alternativa | `X-Api-Key: mca_xxxxxxxx…` |
| Correlação | `X-Request-Id: <uuid>` (enviado pelo cliente e devolvido em todas as respostas, incluindo erros) |
| Scope necessário | `onboarding` **ou** `all` (para `/onboarding` e `/bootstrap`) · `users` **ou** `all` (para `/users`) · sem scope específico para `GET /me` |

A chave só devolve empresas **ligadas** a ela (empresa dona + códigos `MLC-…`).

---

## 3. Base URL

| Ambiente | Base |
|----------|------|
| Canónica | `{HOST}/api/v1/aggregate/multi-company` |
| Alias legado | `{HOST}/api/v1/multi-company` |

Exemplos de host: `https://app.sisgesc.net`, `https://app.zyvoerp.com`.

`GET /me` devolve os metadados actuais da chave (`key.name`, `key.scopes`, `key.status`, `owner_company_id`, `company_ids`, `companies[]`) e é usado pelo HOTEL no teste de ligação para refrescar os scopes persistidos.

---

## 4. Endpoint principal — bootstrap

```http
GET /api/v1/aggregate/multi-company/onboarding
GET /api/v1/aggregate/multi-company/bootstrap
Authorization: Bearer mca_…
```

Alias equivalente: `/api/v1/multi-company/onboarding`.

### Query opcional

| Param | Descrição |
|-------|-----------|
| `company_id` | Filtrar uma empresa ligada (ex.: `22`) |
| `company_ids` | Lista separada por vírgulas |

### Resposta `200`

```json
{
  "success": true,
  "data": {
    "source": {
      "product": "sigesc",
      "api_version": "v1",
      "base_path": "/api/v1/aggregate",
      "module": "multi_company",
      "endpoint": "onboarding"
    },
    "key": {
      "id": 3,
      "name": "Clínica ACME",
      "prefix": "mca_ab12cd34ef56",
      "owner_company_id": 22,
      "scopes": ["all"],
      "status": "active"
    },
    "company_ids": [22],
    "companies_count": 1,
    "companies": [
      {
        "id": 22,
        "external_id": "22",
        "reference": 22,
        "name": "Clínica ACME Lda",
        "email": "admin@acme.ao",
        "phone": "+244900000000",
        "nif": "5000123456",
        "city": "Luanda",
        "country": "Angola",
        "country_id": 1,
        "language": "pt",
        "timezone": "Africa/Luanda",
        "slogan": null,
        "description": null,
        "sede": null,
        "platform_status": "active",
        "image": "companies/logo.png",
        "activity_type": "Saúde",
        "activity_type_id": 4,
        "currency": "AOA",
        "address": {
          "street": "Av. Example",
          "number": "10",
          "city": "Luanda",
          "state": null,
          "zip_code": null,
          "country_id": 1
        },
        "warehouses": [
          { "id": 5, "name": "Armazém principal", "city": "Luanda", "status": true }
        ],
        "is_owner": true,
        "link_role": "owner",
        "users_count": 2,
        "users": [
          {
            "id": 101,
            "external_id": "101",
            "company_id": 22,
            "name": "Maria",
            "surname": "Silva",
            "full_name": "Maria Silva",
            "email": "maria@acme.ao",
            "state": "active",
            "image": null,
            "warehouse_id": 5,
            "warehouse_name": "Armazém principal",
            "language": "pt",
            "role": { "id": 1, "name": "Admin", "level": "admin" },
            "access_level": "admin",
            "created_at": "2026-01-10T10:00:00+00:00",
            "updated_at": "2026-01-10T10:00:00+00:00"
          },
          {
            "id": 102,
            "external_id": "102",
            "company_id": 22,
            "name": "João",
            "surname": "Costa",
            "full_name": "João Costa",
            "email": "joao@acme.ao",
            "state": "active",
            "image": null,
            "warehouse_id": null,
            "warehouse_name": null,
            "language": "pt",
            "role": { "id": 3, "name": "Manager", "level": "manager" },
            "access_level": "manager",
            "created_at": "2026-02-01T08:00:00+00:00",
            "updated_at": "2026-02-01T08:00:00+00:00"
          }
        ],
        "created_at": "2025-11-01T12:00:00+00:00",
        "updated_at": "2026-10-01T09:00:00+00:00"
      }
    ],
    "suggested_bootstrap": {
      "purpose": "Bootstrap a partner product (clinic, pharmacy, HUB, …) from an existing SIGESC company without creating a new SIGESC account.",
      "map_organization_by": ["external_id", "nif", "email"],
      "map_users_by": ["email", "external_id"],
      "role_mapping": {
        "Admin": "admin",
        "Manager": "manager",
        "User": "user"
      },
      "access_levels": ["admin", "manager", "user"],
      "notes": [
        "Store company.external_id and user.external_id as the SIGESC identifiers.",
        "Prefer matching users by email when inviting into the partner product.",
        "Passwords are never returned — partner products must send their own invite / set-password flow.",
        "Reuse the same mca_ key for later Aggregate pulls (products, sales, …) and inbound writes."
      ]
    }
  }
}
```

### Níveis de acesso (`access_level` / `role.level`)

| Valor | Significado no SIGESC | Uso sugerido no parceiro |
|-------|----------------------|---------------------------|
| `admin` | Role `Admin` | Dono / administrador da organização |
| `manager` | Role `Manager` | Gestor (ex.: farmácia, recepção) |
| `user` | Role `User` | Utilizador operacional |

**Passwords nunca são devolvidas.** O produto parceiro deve enviar convite / definir password própria.

---

## 5. Endpoint de sincronização — utilizadores

Para refrescar só a lista de logins (sem o pacote completo de empresas):

```http
GET /api/v1/aggregate/multi-company/users
GET /api/v1/aggregate/multi-company/users/{id}
Authorization: Bearer mca_…
```

**Scope:** `users` ou `all`.

| Query | Descrição |
|-------|-----------|
| `company_id` | Filtrar empresa |
| `search` | Nome, apelido ou email |
| `state` | Estado do utilizador (ex.: `active`) |
| `role` / `role_level` | `admin` \| `manager` \| `user` |
| `role_id` | ID do role no SIGESC |
| `page`, `per_page` | Paginação (default 25, max 100) |

Envelope igual ao resto da Aggregate API (`success`, `data`, `meta.pagination`).

> **Nota:** isto são **utilizadores de login** da aplicação (Admin/Manager/User), **não** empregados HR (`/employees`).

---

## 6. Erros comuns

| HTTP | Quando |
|------|--------|
| `401` | Chave em falta, inválida, revogada ou expirada |
| `403` | Scope `onboarding` / `users` em falta (use `all` ou adicione o scope na UI) |
| `422` | `company_id` pedido não está ligado à chave |
| `429` | Rate limit (default 120 req/min/chave) |

Envelope de erro:

```json
{
  "success": false,
  "error": { "message": "…", "code": 403 }
}
```

---

## 7. Exemplo cURL

```bash
curl -sS \
  -H "Authorization: Bearer mca_SEU_TOKEN" \
  -H "Accept: application/json" \
  "https://app.sisgesc.net/api/v1/aggregate/multi-company/onboarding"
```

Filtrar uma empresa:

```bash
curl -sS \
  -H "Authorization: Bearer mca_SEU_TOKEN" \
  -H "Accept: application/json" \
  "https://app.sisgesc.net/api/v1/aggregate/multi-company/onboarding?company_id=22"
```

---

## 8. Checklist para a equipa parceira

- [ ] Pedir ao cliente chave `mca_` com scope `onboarding` (ou `all`) criada no SIGESC
- [ ] Chamar `GET /onboarding` no primeiro “ligar conta”
- [ ] Persistir `companies[].external_id`, `nif`, `currency`, `image`, endereço
- [ ] Criar/ligar utilizadores locais por `email` + `external_id`; mapear `access_level`
- [ ] Enviar convite / set-password no vosso produto (sem password SIGESC)
- [ ] Guardar a chave de forma segura (servidor) para API/webhooks seguintes
- [ ] (Opcional) Usar `GET /users` para sync periódico de acessos

---

## 9. Relacionado

| Doc | Conteúdo |
|-----|----------|
| [MULTI_COMPANY_AGGREGATE_API.md](./MULTI_COMPANY_AGGREGATE_API.md) | Índice completo Aggregate |
| [API_AGGREGATE_CLINIC_PHARMACY.md](./API_AGGREGATE_CLINIC_PHARMACY.md) | Catálogo + faturas farmácia |
| [HUB_INBOUND_WEBHOOK_PUSH.md](./HUB_INBOUND_WEBHOOK_PUSH.md) | Push SIGESC → parceiro |

Código: `OnboardingController`, `UserController`, `MultiCompanyOnboardingService`, scopes em `config/aggregate_api.php`.
