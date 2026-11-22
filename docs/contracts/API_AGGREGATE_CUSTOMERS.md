# API Aggregate — Clientes

Documento para produtos parceiros (clínica, farmácia, HUB, …) que precisam de **consultar**, **pesquisar**, **criar** e **editar** clientes no SIGESC / Zyvo via Aggregate Multi-Company.

Podes copiar este ficheiro na íntegra para a documentação do outro sistema.

---

## 1. Auditoria de rotas (sem duplicação)

| Método | Caminho Aggregate | Estado | Notas |
|--------|-------------------|--------|--------|
| `GET` | `/customers` | Existente | Lista + pesquisa (`search`, `status`, …) |
| `GET` | `/customers/{id}` | Existente | Detalhe |
| `POST` | `/customers` | **Novo** | Criar cliente |
| `PUT` / `PATCH` | `/customers/{id}` | **Novo** | Alterar dados de perfil |

**Não duplicámos** rotas de leitura. Escritas usam o mesmo prefixo `/customers` e o mesmo middleware/scope `customers`.

`GET …/reports/customers` (relatórios) é outro recurso — não é CRUD de clientes.

APIs da loja pública / sessão de e-commerce **não** são o contrato Aggregate.

---

## 2. Autenticação

| Item | Valor |
|------|--------|
| Tipo | Chave Aggregate `mca_…` |
| Header | `Authorization: Bearer mca_…` ou `X-Api-Key: mca_…` |
| Scope | `customers` **ou** `all` |
| Base canónica | `{HOST}/api/v1/aggregate/multi-company` |
| Alias legado | `{HOST}/api/v1/multi-company` |

A chave só acede a empresas **ligadas** a ela. Filtra com `company_id` / `company_ids` / `company_reference`.

---

## 3. Listar e pesquisar

```http
GET /api/v1/aggregate/multi-company/customers
Authorization: Bearer mca_…
Accept: application/json
```

### Query params

| Param | Descrição |
|-------|-----------|
| `company_id` / `company_ids` | Restringe às empresas autorizadas |
| `company_reference` / `company_references` | Alternativa por referência |
| `search` / `q` | Nome, apelido, email, telefone, NIF, `customer_code` |
| `status` | `active` / `1` / `true` ou `inactive` / `0` / `false` |
| `per_page` | Paginação |
| `sort` / `direction` | `id`, `name`, `created_at`, `updated_at`, `company_id` |
| `date_from` / `date_to` | Intervalo em `created_at` |

Exemplos:

```http
GET …/customers?company_id=22&search=maria
GET …/customers?company_id=22&status=active&search=900
GET …/customers/120?company_id=22
```

### Resposta (lista)

```json
{
  "success": true,
  "data": [
    {
      "id": 120,
      "company_id": 22,
      "reference": "45",
      "customer_code": "CLI-120",
      "name": "Maria",
      "surname": "Silva",
      "full_name": "Maria Silva",
      "email": "maria@exemplo.com",
      "phone": "+244900000000",
      "nif": "5000000000",
      "city": "Luanda",
      "province": "Luanda",
      "customer_type": null,
      "status": true,
      "credit_limit": 100000,
      "account_balance": 0,
      "country": { "id": 1, "name": "Angola", "code": "AO" },
      "created_at": "2026-11-14T20:00:00+00:00",
      "updated_at": "2026-11-14T20:00:00+00:00"
    }
  ],
  "meta": {
    "pagination": {
      "current_page": 1,
      "per_page": 25,
      "total": 1,
      "last_page": 1
    }
  }
}
```

O detalhe (`GET /customers/{id}`) inclui ainda `address`, `birth_date`, `sex`, `image`.

---

## 4. Criar cliente

```http
POST /api/v1/aggregate/multi-company/customers
Authorization: Bearer mca_…
Content-Type: application/json
```

```json
{
  "company_id": 22,
  "name": "Maria",
  "surname": "Silva",
  "email": "maria@exemplo.com",
  "phone": "+244900000000",
  "nif": "5000000000",
  "address": "Rua 1",
  "city": "Luanda",
  "province": "Luanda",
  "country_id": 1,
  "customer_code": "CLI-120",
  "credit_limit": 100000,
  "status": "active",
  "customer_type": "individual"
}
```

### Campos aceites (criar / actualizar)

| Campo API | Efeito |
|-----------|--------|
| `company_id` | Obrigatório no **create**; **ignorado** no update |
| `name` / `nome` | Nome (obrigatório no create) |
| `surname` | Apelido |
| `email` | Email (único por empresa, se preenchido) |
| `phone` | Telefone |
| `nif` | NIF (único por empresa, se preenchido) |
| `address` | Morada |
| `city` / `province` | Localização |
| `country_id` | País |
| `customer_type` | Tipo |
| `customer_code` | Código interno (único por empresa) |
| `sponsor_code` / `sponsor_id` | Patrocínio / MLM se aplicável |
| `credit_limit` | Limite de crédito |
| `account_balance` | Saldo (só se enviado explicitamente) |
| `terms_payment_id` | Condição de pagamento |
| `birth_date` | Data de nascimento (`YYYY-MM-DD`) |
| `sex` | Sexo |
| `image` | URL da imagem |
| `reference` | Referência (auto no create se omitida) |
| `status` / `estado` | `active`/`true`/`1` ou `inactive`/`false`/`0` |

Também podes enviar um objecto aninhado `customer: { … }` (mesmo formato usado em `POST /sales`).

**Não aceite via Aggregate:** `password`, sessão de loja online.

Unicidade (por `company_id`): `email`, `nif`, `customer_code` — se já existirem → `422`.

Resposta `201`:

```json
{
  "success": true,
  "data": {
    "created": true,
    "customer": { "id": 120, "name": "Maria", "…": "…" }
  }
}
```

---

## 5. Editar cliente

```http
PATCH /api/v1/aggregate/multi-company/customers/120
Authorization: Bearer mca_…
Content-Type: application/json
```

`PUT` é equivalente a `PATCH` (só actualiza os campos enviados).

```json
{
  "phone": "+244911111111",
  "city": "Benguela",
  "credit_limit": 150000,
  "status": "active"
}
```

Resposta `200`:

```json
{
  "success": true,
  "data": {
    "created": false,
    "customer": { "id": 120, "phone": "+244911111111", "…": "…" }
  }
}
```

Erros típicos:

| HTTP | Situação |
|------|----------|
| `404` | ID fora das empresas da chave |
| `422` | Validação / email·NIF·código duplicado / sem campos |
| `401` / `403` | Chave em falta ou scope sem `customers` |

---

## 6. O que isto **não** faz

- Não gere passwords de portal do cliente
- Não gere lista completa de moradas / cartões / seguros (só campos do perfil principal)
- Não move o cliente para outra `company_id`
- Não substitui a criação implícita de cliente em `POST /sales` (essa continua a poder criar/reutilizar por email)

Para faturas com cliente existente: enviar `customer_id` em `POST /sales` — ver `API_AGGREGATE_INVOICES.md`.

---

## 7. Checklist parceiro

- [ ] Chave `mca_` com scope `customers` (ou `all`)
- [ ] `GET /customers?search=…&company_id=…`
- [ ] `GET /customers/{id}`
- [ ] `POST /customers` com `company_id` + `name`
- [ ] `PATCH /customers/{id}` para telefone, morada, estado, etc.
- [ ] Tratar `422` de email/NIF duplicado e `404` de isolamento por empresa
