# API Aggregate — Produtos (catálogo) + Criação de faturas

Documento para a **equipa do produto parceiro** (clínica, farmácia, HUB, …).

Inclui:

1. **Catálogo de produtos** (lista completa) — contrato já existente da Aggregate API  
2. **Criação de faturas** de ponta a ponta — com cuidados obrigatórios  

**Base:** `{HOST}/api/v1/aggregate/multi-company`  
**Alias:** `{HOST}/api/v1/multi-company`  
**Auth (estes endpoints):** `Authorization: Bearer mca_…` (chave devolvida no `POST /onboarding/register` ou criada no SIGESC)  
**Scopes:** `products` · `sales` · ou `all`

---

## Fluxo recomendado (E2E)

```text
1. Guardar mca_  (da criação da empresa ou do onboarding)
2. GET  /products?company_id=…&kind=product|service   ← escolher product_id + preço
3. (opcional) GET/POST/PATCH /customers               ← ver API_AGGREGATE_CUSTOMERS.md; ou dados na fatura
4. POST /sales   com items[] + external_id            ← cria Cotação/Proforma
5. (opcional) POST /sales/{sale_key}/items            ← acrescentar linhas
6. GET  /sales/{sale_key}                             ← confirmar totais
7. Publicar / pagar / stock  →  dentro do SIGESC UI   ← NÃO via API Aggregate
```

---

# Parte A — Catálogo de produtos (lista completa)

> Secção alinhada ao contrato actual de `GET /products` / `GET /products/{id}`  
> (ver também `MULTI_COMPANY_AGGREGATE_API.md` §4.4 e `API_AGGREGATE_CLINIC_PHARMACY.md` §3).

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
| `search` | Nome / código |
| `status` | Estado (`estado`) |
| `category_id` | Categoria |
| `product_type_id` | Tipo |
| `from` / `to` | Intervalo de datas |
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
| `description` | Descrição |
| `code` / `reference` / `barcode` | Códigos |
| `image` | Imagem |
| `status` | Estado |
| `sale_price` / `price` | Preço de venda |
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

Envelope:

```json
{
  "success": true,
  "data": [ /* produtos */ ],
  "meta": {
    "pagination": {
      "current_page": 1,
      "per_page": 25,
      "total": 120,
      "last_page": 5
    }
  }
}
```

**Nota para faturas:** nas linhas usem `product_id` = `id` do catálogo. Se não enviarem `unit_price`, o SIGESC usa `sale_price` do produto. O imposto da linha usa `tax_percent` do produto.

---

# Parte B — Criação de faturas (cuidado obrigatório)

## B.1 Regras de ouro

1. **Só criar em `Cotação` ou `Proforma`** via API.  
   Não enviar `Publicado` / `Pago` — a publicação no SIGESC dispara stock, numeração fiscal e pagamentos. A API **rejeita** esses estados.
2. **Sempre enviar `external_id`** único no vosso sistema (idempotência). Repetir o mesmo `external_id` **não junta itens** — devolve a fatura existente (`200`, `idempotent: true`).
3. **Pelo menos uma linha** em `items[]` (salvo `allow_empty_items: true`, não recomendado).
4. **`company_id`** tem de estar ligado à chave `mca_`.
5. Produtos têm de existir nessa empresa (`GET /products` antes).
6. Depois de criar: **publicar / cobrar / stock no SIGESC** (UI ou processos internos), não nesta API.

## B.2 Endpoints

```http
POST /api/v1/aggregate/multi-company/sales
POST /api/v1/aggregate/multi-company/sales/{id}/items
GET  /api/v1/aggregate/multi-company/sales/{sale_key}
POST /api/v1/aggregate/multi-company/inbound
POST /api/v1/aggregate/multi-company/inbound/sales
```

**Scope:** `sales` ou `all`  
`{id}` / `{sale_key}`: `billing-123` ou `123` (só billing para write).

---

## B.3 `POST /sales` — criar fatura

### Headers

```http
Authorization: Bearer mca_…
Content-Type: application/json
Accept: application/json
```

### Exemplo (único) — payload completo

```json
{
  "company_id": 88,
  "external_id": "PHARM-INV-2026-0042",
  "partner": "clinic_pharmacy",
  "state": "Cotação",
  "date": "2026-10-23",
  "date_due": "2026-10-30",
  "notes": "Receita / atendimento #991",
  "warehouse_id": 5,
  "customer_name": "Maria Silva",
  "customer_email": "maria@exemplo.com",
  "customer_phone": "+244900000000",
  "customer_nif": "000123456",
  "items": [
    {
      "product_id": 55,
      "quantity": 2,
      "unit_price": 1500,
      "discount": 0,
      "description": "Medicamento A — caixa"
    },
    {
      "product_id": 90,
      "quantity": 1
    }
  ]
}
```

### Campos

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `company_id` | **sim** | Empresa SIGESC (ligada à chave) |
| `items` / `lines` | **sim*** | Lista de linhas (*salvo `allow_empty_items`) |
| `items[].product_id` | **sim** | ID do `GET /products` (aliases: `id`, `produtos_id`) |
| `items[].quantity` / `qty` | recomendado | Default `1` |
| `items[].unit_price` / `price` / `sale_price` | opcional | Se omitido → `sale_price` do produto |
| `items[].discount` | opcional | Desconto em valor da linha |
| `items[].description` | opcional | Nota parceiro (guardada em metadata da linha) |
| `items[].warehouse_id` | opcional | Sobrescreve armazém da linha |
| `external_id` / `external_reference` | **fortemente recomendado** | Idempotência |
| `partner` | opcional | Ex.: `clinic_pharmacy` |
| `state` | opcional | Só `Cotação` / `Proforma` (aliases: `draft`, `quote`, `proforma`). Default `Cotação` |
| `date` / `document_date` / `date_order` | opcional | Default hoje |
| `date_due` | opcional | Default = `date` |
| `warehouse_id` / `armagen_id` | opcional | Armazém; default = primeiro da empresa |
| `customer_id` / `costumer_id` | opcional | Cliente já existente |
| `customer_name` / `customer_email` / `customer_phone` / `customer_nif` | opcional | Cria/actualiza cliente se não houver `customer_id` |
| `customer` | opcional | Objecto aninhado `{ name, email, phone, nif }` |
| `notes` | opcional | Notas (metadata) |
| `allow_empty_items` | opcional | Default `false` — não usar em produção |

### Cálculo de cada linha

```text
net        = (unit_price × quantity) − discount
tax_amount = net × (product.tax_percent / 100)
line_total = net + tax_amount
```

Totais da fatura: soma das linhas → `total` / `rest_payable` / `tax` / `subtotal`.

---

## B.4 Respostas

### `201 Created` — nova fatura

```json
{
  "success": true,
  "data": {
    "created": true,
    "idempotent": false,
    "hint": "Invoice created as Cotação/Proforma. Publish and take payment inside SIGESC (stock + fiscal). Use sale_key for later GET /sales/{sale_key} or POST …/items.",
    "sale": {
      "id": 123,
      "sale_key": "billing-123",
      "source": "billing",
      "company_id": 88,
      "order_reference": "PHARM-INV-2026-0042",
      "state": "Cotação",
      "total": 3450.0,
      "subtotal": 3000.0,
      "tax": 450.0,
      "rest_payable": 3450.0,
      "date": "2026-10-23",
      "date_due": "2026-10-30",
      "customer": {
        "id": 77,
        "name": "Maria",
        "surname": "Silva",
        "email": "maria@exemplo.com"
      },
      "items": [
        {
          "id": 1,
          "quantity": 2,
          "unit_price": 1500,
          "discount": 0,
          "tax_percent": 14,
          "tax_amount": 420,
          "line_total": 3420,
          "product": {
            "id": 55,
            "name": "Medicamento A",
            "code": "MED-A",
            "sale_price": 1500
          }
        }
      ],
      "payments": []
    }
  }
}
```

### `200 OK` — idempotente

Mesmo `external_id` → `created: false`, `idempotent: true`, `sale` = fatura existente **sem alterar itens**.

### `422` — validação (exemplos)

| Situação | Mensagem típica |
|----------|-----------------|
| Sem `company_id` / não ligada | `company_id is required and must be linked…` |
| Sem itens | `At least one item is required…` |
| `product_id` inválido | `Product #… not found… List catalog with GET /products first.` |
| `state: Publicado` | `API create only allows Cotação or Proforma…` |
| Sem utilizadores na empresa | `Company has no users to own the invoice.` |
| `warehouse_id` inválido | `Warehouse #… not found…` |
| Cliente `customer_id` inválido | `Customer not found for this company.` |

```json
{
  "success": false,
  "error": { "message": "…", "code": 422 },
  "errors": { "state": ["…"] }
}
```

### `401` / `403` / `429`

Chave em falta/inválida · scope `sales` em falta · rate limit.

---

## B.5 `POST /sales/{sale_key}/items` — acrescentar linhas

Só em estados editáveis: `Cotação`, `Proforma`.

```http
POST /sales/billing-123/items
Authorization: Bearer mca_…
```

```json
{
  "items": [
    { "product_id": 77, "quantity": 1, "unit_price": 500 }
  ]
}
```

Resposta: objecto `sale` actualizado (`success` + `data`).

---

## B.6 Consultar fatura

```http
GET /sales/billing-123
GET /sales?company_id=88&source=billing&state=Cotação
```

---

## B.7 Alternativa: webhook inbound (envelope estilo HUB)

```http
POST /inbound
POST /inbound/sales
Authorization: Bearer mca_…
Idempotency-Key: <uuid>
```

```json
{
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
  "strict": false,
  "operations": [
    {
      "resource": "sales",
      "action": "upsert",
      "company_external_id": "88",
      "data": [
        {
          "id": "PHARM-INV-2026-0042",
          "customer_name": "Maria Silva",
          "items": [{ "product_id": 55, "quantity": 2 }]
        }
      ]
    }
  ]
}
```

A dedupe real continua a ser o `external_id` / `id` da venda (não só o header). Detalhes: `API_AGGREGATE_CLINIC_PHARMACY.md` §4.3.

---

## B.8 Exemplo cURL (catálogo → fatura)

```bash
export KEY='mca_…'
export HOST='https://app.sisgesc.net'
export BASE="$HOST/api/v1/aggregate/multi-company"

# 1) Catálogo
curl -sS -H "Authorization: Bearer $KEY" \
  "$BASE/products?company_id=88&kind=product&per_page=50"

# 2) Criar fatura (Cotação)
curl -sS -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "$BASE/sales" \
  -d '{
    "company_id": 88,
    "external_id": "PHARM-INV-2026-0042",
    "partner": "clinic_pharmacy",
    "customer_name": "Maria Silva",
    "customer_email": "maria@exemplo.com",
    "items": [
      { "product_id": 55, "quantity": 2, "unit_price": 1500 }
    ]
  }'

# 3) Confirmar
curl -sS -H "Authorization: Bearer $KEY" \
  "$BASE/sales/billing-123"
```

---

## B.9 Checklist equipa parceira

- [ ] Chave `mca_` com scopes `products` + `sales` (ou `all`)
- [ ] Listar produtos com `kind=product|service` e guardar `id` / `sale_price` / `tax_percent`
- [ ] Gerar `external_id` único por fatura no vosso sistema
- [ ] `POST /sales` só com `Cotação` ou `Proforma` + ≥1 item
- [ ] Tratar `201` (nova) vs `200` idempotente (não reenviar linhas esperando merge)
- [ ] Guardar `sale.sale_key` / `sale.id`
- [ ] Publicar e cobrar **no SIGESC** (não nesta API)
- [ ] (Opcional) Acrescentar linhas com `POST /sales/{sale_key}/items` enquanto editável

---

## Relacionado

| Doc | Conteúdo |
|-----|----------|
| [API_AGGREGATE_COMPANY_CREATE.md](./API_AGGREGATE_COMPANY_CREATE.md) | Criar empresa (host da marca) + emitir `mca_` |
| [API_AGGREGATE_ONBOARDING.md](./API_AGGREGATE_ONBOARDING.md) | Bootstrap empresa já existente |
| [API_AGGREGATE_CLINIC_PHARMACY.md](./API_AGGREGATE_CLINIC_PHARMACY.md) | Farmácia / inbound |
| [MULTI_COMPANY_AGGREGATE_API.md](./MULTI_COMPANY_AGGREGATE_API.md) | Índice Aggregate |

Código: `ProductController`, `SaleController@store` / `addItems`, `MultiCompanySaleWriteService`.
