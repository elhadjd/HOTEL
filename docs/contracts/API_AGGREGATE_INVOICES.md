# API Aggregate — Produtos (catálogo) + Criação de faturas

Documento para a **equipa do produto parceiro** (clínica, farmácia, HUB, …).

Inclui:

1. **Catálogo de produtos** (lista completa) — contrato já existente da Aggregate API  
2. **Criação de faturas** de ponta a ponta — com cuidados obrigatórios  

**Base:** `{HOST}/api/v1/aggregate/multi-company`  
**Alias:** `{HOST}/api/v1/multi-company`  
**Auth (estes endpoints):** `Authorization: Bearer mca_…` (chave devolvida no `POST /onboarding/register` ou criada no SIGESC)  
**Scopes:** `products` · `sales` · `payments` · ou `all`

---

## Fluxo recomendado (E2E)

```text
1. Guardar mca_  (da criação da empresa ou do onboarding)
2. GET  /products?company_id=…&kind=product|service   ← escolher product_id + preço oficial
3. (opcional) GET/POST/PATCH /customers               ← ver API_AGGREGATE_CUSTOMERS.md; ou dados na fatura
4. POST /sales   com items[] + external_id            ← cria Cotação/Proforma (201 novo / 200 idempotente)
5. (opcional) POST /sales/{sale_key}/items            ← acrescentar linhas (com Idempotency-Key)
6. GET  /sales/{sale_key}                             ← confirmar totais, impostos e rest_payable
7. POST /sales/{sale_key}/publish                     ← publicar como documento fiscal definitivo (FT) com numeração + SAF-T-AO + stock
8. GET  /payment-methods?company_id=…                 ← listar métodos de pagamento e caixas/contas bancárias válidas
9. POST /sales/{sale_key}/payments                    ← liquidar total ou parcialmente (recibo RC + atualização de rest_payable/Pago)
```

> **Estados canónicos no SIGESC:** `Cotação`, `Proforma`, `Publicado`, `Pago`, `Anulado` (e campo `payment_status`: `unpaid` | `partial` | `paid`).

---

# Parte A — Catálogo de produtos (lista completa)

> Secção alinhada ao contrato actual de `GET /products` / `GET /products/{id}`  
> (ver também `MULTI_COMPANY_AGGREGATE_API.md` §4.4).

## A.1 Endpoints

```http
GET /api/v1/aggregate/multi-company/products
GET /api/v1/aggregate/multi-company/products/{id}
```

**Scope:** `products` ou `all`

### Query útil

| Param | Descrição |
|-------|-----------|
| `company_id` | Filtrar empresa ligada à chave |
| `kind` / `catalog` | `product` / `pharmacy` = produtos · `service` = serviços · `all` (default) |
| `search` / `q` | Nome / código / referência / código de barras |
| `status` | Estado (`estado`) |
| `category_id` | Categoria |
| `product_type_id` | Tipo |
| `from` / `to` (`date_from` / `date_to`) | Intervalo de datas |
| `page` / `per_page` | Paginação (default 25, max 100) |

### Exemplos

```http
GET /products?company_id=88&kind=product
GET /products?company_id=88&kind=service
GET /products/55
```

## A.2 Campos devolvidos (lista e detalhe)

Cada produto inclui campos “amigáveis” já normalizados:

| Campo | Significado |
|-------|-------------|
| `id` | **Usar como `product_id` nas linhas da fatura** |
| `company_id` | Empresa dona |
| `name` | Nome |
| `kind` | `product` \| `service` |
| `description` | Descrição |
| `code` / `reference` / `barcode` | Códigos |
| `image` | Imagem |
| `status` | Estado |
| `sale_price` / `price` | Preço de venda oficial |
| `sale_price_ex_tax` | Preço s/ IVA |
| `purchase_price` / `cost` | Preço de custo |
| `purchase_price_ex_tax` | Custo s/ IVA |
| `average_price` | Preço médio |
| `tax_percent` | % imposto do produto (usado no cálculo da linha) |
| `inventory` / `is_sellable` | Flags |
| `unit_of_measure` / `pricing_mode` | Unidade / modo |
| `category_id` / `category_name` / `category{}` | Categoria |
| `product_type{}` | Tipo (produto vs serviço, etc.) |
| `stock_quantity` / `quantity` | Stock agregado |
| `stocks[]` | Breakdown por armazém / lote / validade / sub-armazém |
| `attributes[]` | Variantes (cor, tamanho, opções com preço/stock) |
| `features[]` | Características |
| `variations[]` | Variações |
| `price_levels[]` | Regras de listas de preço |
| `extra_prices[]` | Preços extra / variantes |
| `created_at` / `updated_at` | Timestamps |

**Detalhe** (`GET /products/{id}`) acrescenta: `min_quantity`, `manufacturer`.

**Nota para faturas:** nas linhas usem `product_id` = `id` do catálogo. Se não enviarem `unit_price`, o SIGESC usa `sale_price` do produto. O imposto da linha usa `tax_percent` do produto.

---

# Parte B — Criação de faturas (Cotação / Proforma) e Adição de Linhas

## B.1 Regras de ouro

1. **Criar em `Cotação` ou `Proforma`** via `POST /sales`.  
   Não enviar `Publicado` / `Pago` no create — a emissão definitiva segue o endpoint dedicado `POST /sales/{sale_key}/publish` para garantir numeração fiscal sequencial, hash SAF-T-AO e dedução de stock.
2. **Sempre enviar `external_id`** único no vosso sistema (idempotência garantida em base de dados via `aggregate_sale_idempotencies`). Repetir o mesmo `external_id` **não junta itens** — devolve a fatura existente (`200`, `idempotent: true`).
3. **Pelo menos uma linha** em `items[]` (salvo `allow_empty_items: true`, não recomendado).
4. **`company_id`** tem de estar ligado à chave `mca_`.
5. Produtos têm de existir nessa empresa (`GET /products` antes).
6. **Correlação obrigatória:** enviar `X-Request-Id` em cada pedido; o SIGESC devolve o mesmo header em todas as respostas (incluindo erros).

## B.2 Endpoints

```http
GET  /api/v1/aggregate/multi-company/sales
GET  /api/v1/aggregate/multi-company/sales/{sale_key}
POST /api/v1/aggregate/multi-company/sales
POST /api/v1/aggregate/multi-company/sales/{sale_key}/items
POST /api/v1/aggregate/multi-company/sales/{sale_key}/publish
POST /api/v1/aggregate/multi-company/sales/{sale_key}/payments
GET  /api/v1/aggregate/multi-company/payment-methods
```

**Scopes:** `sales` (ou `all`) para vendas/itens/publicação; `sales` **ou** `payments` (ou `all`) para métodos de pagamento e liquidação.  
`{sale_key}`: `billing-123` ou `123` (apenas vendas `billing` aceitam escrita/publicação/liquidação).

---

## B.3 `POST /sales` — criar Cotação/Proforma

### Headers

```http
Authorization: Bearer mca_…
Content-Type: application/json
Accept: application/json
X-Request-Id: <uuid>
```

### Exemplo de payload

```json
{
  "company_id": 88,
  "external_id": "HOTEL-INV-2026-0042",
  "partner": "hotel",
  "state": "Proforma",
  "date": "2026-11-26",
  "date_due": "2026-12-03",
  "notes": "Estadia #stay-991",
  "customer_id": 77,
  "items": [
    {
      "product_id": 55,
      "quantity": 2,
      "unit_price": 20000,
      "discount": 0,
      "description": "Noite Quarto Deluxe"
    }
  ]
}
```

### Respostas
- **`201 Created`** — `{ "success": true, "data": { "created": true, "idempotent": false, "sale": { … } } }`
- **`200 OK`** — mesmo `external_id` → `{ "success": true, "data": { "created": false, "idempotent": true, "sale": { … } } }` (sem duplicar linhas)
- **`422 Unprocessable Entity`** — validação (`company_id` não autorizado, sem itens, `product_id` inexistente, `state` fora de `Cotação`/`Proforma`, `customer_id` inválido)

---

## B.4 `POST /sales/{sale_key}/items` — acrescentar linhas

Só em estados editáveis: `Cotação`, `Proforma`. Devolve **`409 Conflict`** se já `Publicado`, `Pago` ou `Anulado`.

```http
POST /api/v1/aggregate/multi-company/sales/billing-123/items
Authorization: Bearer mca_…
Idempotency-Key: ui-append-550e8400
```

```json
{
  "idempotency_key": "ui-append-550e8400",
  "items": [
    { "product_id": 77, "quantity": 1, "unit_price": 5000, "discount": 0 }
  ]
}
```

- Executa com lock `FOR UPDATE` e idempotência por `(company_id, 'add_items', idempotency_key)`.
- Resposta **`200`**: `{ "success": true, "data": { …sale } }` com `subtotal`, `tax`, `total` e `rest_payable` recalculados.

---

# Parte C — Publicação Fiscal, Métodos de Pagamento e Liquidação

## C.1 `GET /payment-methods` — métodos de pagamento e contas/caixas

**Scope:** `sales` **ou** `payments` (ou `all`).

```http
GET /api/v1/aggregate/multi-company/payment-methods?company_id=88
Authorization: Bearer mca_…
```

Resposta **`200`**:

```json
{
  "success": true,
  "data": {
    "payment_methods": [
      {
        "id": 10,
        "company_id": 88,
        "name": "Dinheiro",
        "icon": "cash",
        "is_cash": true,
        "status": true,
        "default_bank_account_id": 4,
        "bank_accounts": [
          { "id": 4, "name": "Caixa Principal", "reference": "CASH-88", "iban": null }
        ]
      }
    ],
    "bank_accounts": [
      {
        "id": 4,
        "company_id": 88,
        "name": "Caixa Principal",
        "reference": "CASH-88",
        "account_number": null,
        "iban": null,
        "is_cash": true
      }
    ]
  }
}
```

Se a empresa ainda não tiver método/caixa configurado, o SIGESC inicializa automaticamente a caixa padrão via `CompanyDefaultCashBootstrapService`.

---

## C.2 `POST /sales/{sale_key}/publish` — publicar documento fiscal

**Scope:** `sales` (ou `all`).

Converte uma `Cotação` ou `Proforma` (`PP`) em documento fiscal definitivo imutável (padrão `FT` — Fatura) reutilizando exatamente o fluxo interno do SIGESC:
- Numeração sequencial fiscal (`BillingDocumentNumberService`)
- Hash SAF-T-AO (`InvoiceGenerator::generateSAFTHash`)
- Dedução de stock para artigos inventariáveis (`StockService::deductStock`)
- Regra de prazos de pagamento (`PaymentTermRuleService`) e elegibilidade AGT FE
- Transação atómica com `FOR UPDATE` e idempotência em `aggregate_sale_idempotencies`

```http
POST /api/v1/aggregate/multi-company/sales/billing-123/publish
Authorization: Bearer mca_…
Idempotency-Key: publish-inv-123-uuid
Content-Type: application/json
```

```json
{
  "document_type": "receipt",
  "idempotency_key": "publish-inv-123-uuid",
  "date_due": "2026-12-10",
  "notes": "Publicação no check-out"
}
```

- `document_type`: `"receipt"` / `"FT"` (default), `"advance"` / `"FA"`, `"global"` / `"FG"`, `"generic"` / `"GF"`. (`"FR"` é rejeitado com `422` porque Fatura-Recibo não pode ser publicada sem pagamento.)
- Resposta **`200`**:

```json
{
  "success": true,
  "data": {
    "published": true,
    "idempotent": false,
    "document_number": "FT SG2026/1",
    "sale": {
      "id": 123,
      "sale_key": "billing-123",
      "document_number": "FT SG2026/1",
      "document_type": "FT",
      "state": "Publicado",
      "payment_status": "unpaid",
      "total": 45600,
      "rest_payable": 45600,
      "collected": 0
    }
  }
}
```

- Retries com a mesma `idempotency_key` devolvem **`200`** com `published: false, idempotent: true`.
- Erros: `403` (sem scope `sales`), `404` (venda fora das empresas da chave), `409` (já `Publicado`/`Pago`/`Anulado` com chave diferente), `422` (sem linhas, tipo inválido, cliente em falta).

---

## C.3 `POST /sales/{sale_key}/payments` — liquidar (pagamento parcial ou total)

**Scope:** `sales` **ou** `payments` (ou `all`).

Regista um pagamento/recibo (`RC`) contra uma fatura `Publicado` usando `PaymentsServices::BillingCreatePayment` e `BankAccountController::Transaction`, dentro de transação atómica com `FOR UPDATE` e chave única `(company_id, 'payment', idempotency_key)`.

```http
POST /api/v1/aggregate/multi-company/sales/billing-123/payments
Authorization: Bearer mca_…
Idempotency-Key: pay-inv-123-p1
Content-Type: application/json
```

```json
{
  "idempotency_key": "pay-inv-123-p1",
  "external_payment_id": "pay-inv-123-p1",
  "amount": 25000,
  "payment_method_id": 10,
  "bank_account_id": 4,
  "type": "payment",
  "date": "2026-11-26",
  "reference": "TPA-8821",
  "notes": "Pagamento parcial no check-out"
}
```

### Respostas
- **`201 Created`** — novo pagamento registado (`created: true, idempotent: false`)
- **`200 OK`** — replay com a mesma `idempotency_key` (`created: false, idempotent: true`, zero duplicação)

```json
{
  "success": true,
  "data": {
    "created": true,
    "idempotent": false,
    "payment": {
      "id": 501,
      "number": "RC SG2026/1",
      "amount": 25000,
      "remaining_payable": 20600,
      "date": "2026-11-26",
      "status": "Publicado",
      "type": "payment",
      "bank_account_id": 4,
      "method": { "id": 10, "name": "Dinheiro" },
      "notes": "Ref: TPA-8821 | Pagamento parcial no check-out"
    },
    "sale": {
      "id": 123,
      "sale_key": "billing-123",
      "state": "Publicado",
      "payment_status": "partial",
      "total": 45600,
      "rest_payable": 20600,
      "collected": 25000
    }
  }
}
```

Quando `rest_payable` atinge `0`, a fatura passa automaticamente a `state: "Pago"` e `payment_status: "paid"`.

### Erros de liquidação
| HTTP | Causa |
|------|-------|
| `401` | Chave inválida/revogada/expirada |
| `403` | Scope sem `sales` nem `payments` |
| `404` | Fatura inexistente ou pertencente a outra empresa |
| `409` | Fatura ainda em `Cotação`/`Proforma`, já `Pago` (`rest_payable = 0`), ou `Anulado` |
| `422` | `idempotency_key` em falta, `amount <= 0`, `amount > rest_payable`, `payment_method_id` ou `bank_account_id` inválido/de outra empresa |

---

## Checklist equipa HOTEL

- [ ] Chave `mca_` com scopes `onboarding`, `users`, `customers`, `products`, `sales`, `payments` (ou `all`)
- [ ] Listar produtos com `kind=product|service` e sincronizar mapeamentos em edições de preço
- [ ] Gerar `external_id` único por fatura e enviar `Idempotency-Key` em `addItems`, `publish` e `payments`
- [ ] Tratar `201` (novo) vs `200` (idempotente) e `503`/`504` como `RECONCILIATION_REQUIRED`
- [ ] Carregar métodos reais via `GET /payment-methods` antes de liquidar
- [ ] Exigir permissão RBAC `integrations.invoices.settle` para publicar e liquidar faturas no HOTEL

Código SIGESC: `SaleController`, `PaymentMethodController`, `MultiCompanySaleWriteService`, `MultiCompanySaleSettlementService`.  
Código HOTEL: `http-adapter.ts`, `mock-adapter.ts`, `invoice-service.ts`, `invoice-settlement-actions.tsx`.
