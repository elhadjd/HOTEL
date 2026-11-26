# API Aggregate — Produtos e Serviços

Documento para produtos parceiros (clínica, farmácia, HUB, …) que precisam de **pesquisar** e **alterar** o catálogo SIGESC / Zyvo via Aggregate Multi-Company.

Podes copiar este ficheiro na íntegra para a documentação do outro sistema.

---

## 1. Auditoria de rotas (sem duplicação)

| Método | Caminho Aggregate | Estado | Notas |
|--------|-------------------|--------|--------|
| `GET` | `/products` | Existente | Lista + filtros (`search`, `kind`, …) |
| `GET` | `/products/{id}` | Existente | Detalhe |
| `POST` | `/products` | **Novo** | Criar produto ou serviço |
| `PUT` / `PATCH` | `/products/{id}` | **Novo** | Alterar campos de catálogo |

**Não duplicámos** rotas de leitura. Escritas usam o mesmo prefixo `/products` e o mesmo middleware/scope `products`.

Outras APIs do monólito (UI web, mobile business, marketplace, loja pública) **não** são o contrato Aggregate — não as uses a partir do produto parceiro.

Stock / movimentos de inventário **não** passam por estes endpoints (só campos de catálogo). Stock continua a ser gerido no SIGESC ou por APIs dedicadas de stock.

---

## 2. Autenticação

| Item | Valor |
|------|--------|
| Tipo | Chave Aggregate `mca_…` |
| Header | `Authorization: Bearer mca_…` ou `X-Api-Key: mca_…` |
| Scope | `products` **ou** `all` |
| Base canónica | `{HOST}/api/v1/aggregate/multi-company` |
| Alias legado | `{HOST}/api/v1/multi-company` |

A chave só acede a empresas **ligadas** a ela. Filtra com `company_id` / `company_ids` / `company_reference`.

---

## 3. Pesquisa / listagem

```http
GET /api/v1/aggregate/multi-company/products
Authorization: Bearer mca_…
Accept: application/json
```

### Query params

| Param | Descrição |
|-------|-----------|
| `company_id` / `company_ids` | Restringe às empresas autorizadas |
| `company_reference` / `company_references` | Alternativa por referência |
| `search` / `q` | Nome, código, referência, descrição, código de barras |
| `kind` / `catalog` | `product` \| `service` \| `all` (default) |
| `status` | Ex.: `active` |
| `category_id` | Categoria |
| `product_type_id` | Tipo exacto |
| `per_page` | Paginação (default `25`, max `100`) |
| `sort` / `direction` / `order` | Ordenação (`id`, `nome`, `created_at`, …) |
| `date_from` / `date_to` (`from` / `to`) | Intervalo em `created_at` |

Header recomendado: `X-Request-Id: <uuid>`.

Exemplos:

```http
GET …/products?company_id=22&search=paracetamol
GET …/products?company_id=22&kind=product
GET …/products?company_id=22&kind=service
GET …/products/55?company_id=22
```

### `kind`

| Valor | Resultado |
|-------|-----------|
| `product` / `pharmacy` / `produto` | Exclui tipos “Serviço” |
| `service` / `servico` | Só serviços |
| `all` | Tudo |

### Resposta (lista)

```json
{
  "success": true,
  "data": [
    {
      "id": 55,
      "company_id": 22,
      "name": "Paracetamol 500mg",
      "kind": "product",
      "code": "PAR-500",
      "barcode": "5601234567890",
      "status": "active",
      "sale_price": 1500,
      "purchase_price": 800,
      "tax_percent": 0,
      "category_id": 3,
      "product_type": { "id": 1, "name": "Artigo armagenavel" },
      "stock_quantity": 42,
      "is_sellable": true
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

> **Sincronização imediata no HOTEL:** ao alterar preço ou IVA via `PATCH/PUT /products/{id}`, o HOTEL actualiza imediatamente todos os registos `ProductCatalogMapping` ligados (`centralSalePrice`, `centralTaxPercent`, `centralName`, `centralPriceVerifiedAt`, `lastSyncedAt`).

---

## 4. Criar produto ou serviço

```http
POST /api/v1/aggregate/multi-company/products
Authorization: Bearer mca_…
Content-Type: application/json
```

```json
{
  "company_id": 22,
  "name": "Consulta geral",
  "kind": "service",
  "description": "Consulta de clínica geral",
  "sale_price": 10000,
  "sale_price_ex_tax": 10000,
  "status": "active",
  "is_sellable": true,
  "unit_of_measure": "un"
}
```

Produto (farmácia):

```json
{
  "company_id": 22,
  "name": "Paracetamol 500mg",
  "kind": "product",
  "code": "PAR-500",
  "barcode": "5601234567890",
  "sale_price": 1500,
  "purchase_price": 800,
  "category_id": 3,
  "status": "active"
}
```

### Campos aceites (criar / actualizar)

| Campo API | Coluna / efeito |
|-----------|-----------------|
| `name` / `nome` | Nome (obrigatório no create) |
| `company_id` | Empresa (obrigatório no create; **ignorado** no update) |
| `kind` / `type` | `product` \| `service` → resolve `product_type_id` |
| `product_type_id` | Tipo explícito |
| `description` | Descrição |
| `code` | Código interno |
| `barcode` / `barr_code` / `codego` | Código de barras |
| `reference` | Referência (auto se omitida no create) |
| `sale_price` / `price` | Preço de venda c/ imposto |
| `purchase_price` / `cost` | Custo |
| `sale_price_ex_tax` / `price_out_iva` | Preço s/ IVA |
| `purchase_price_ex_tax` / `cost_out_iva` | Custo s/ IVA |
| `tax_percent` / `imposto` | % imposto |
| `tax_rate_id` | Taxa do regime |
| `status` / `estado` | Ex.: `active` |
| `category_id` | Categoria |
| `is_sellable` | Vendável |
| `inventory` | Flag inventário |
| `allow_backorder` | Backorder |
| `unit_of_measure` | Unidade |
| `pricing_mode` | `unit` \| `weight` |
| `min_quantity` | Stock mínimo (campo catálogo) |
| `manufacturer` / `fabricante` | Fabricante |
| `image` | URL da imagem |
| `tax_exception_code` / `tax_exception_reason` | Excepções fiscais |

**Angola — regime simplificado (OUT):** o servidor força IVA 0% / taxa isenta quando a empresa está nesse regime (não aceita taxas ≠ 0%).

Resposta `201`:

```json
{
  "success": true,
  "data": {
    "created": true,
    "product": { "id": 90, "name": "Consulta geral", "…": "…" }
  }
}
```

---

## 5. Alterar produto ou serviço

```http
PATCH /api/v1/aggregate/multi-company/products/55
Authorization: Bearer mca_…
Content-Type: application/json
```

`PUT` é equivalente a `PATCH` (actualização parcial dos campos enviados).

```json
{
  "sale_price": 1750,
  "name": "Paracetamol 500mg (cx)",
  "status": "active"
}
```

Resposta `200`:

```json
{
  "success": true,
  "data": {
    "created": false,
    "product": { "id": 55, "sale_price": 1750, "…": "…" }
  }
}
```

Erros típicos:

| HTTP | Situação |
|------|----------|
| `404` | ID fora das empresas da chave |
| `422` | Validação / sem campos / company_id inválido no create |
| `401` / `403` | Chave em falta ou scope sem `products` |

---

## 6. O que isto **não** faz

- Não cria movimentos de stock nem lotes
- Não publica na loja / marketplace
- Não substitui a UI SIGESC de artigos
- Não move o artigo para outra `company_id`

Para faturas a partir do catálogo, ver `API_AGGREGATE_INVOICES.md` / `API_AGGREGATE_CLINIC_PHARMACY.md` (`POST /sales`).

---

## 7. Checklist parceiro

- [ ] Chave `mca_` com scope `products` (ou `all`)
- [ ] `GET /products?search=…&kind=product|service`
- [ ] `GET /products/{id}`
- [ ] `POST /products` para novos artigos/serviços
- [ ] `PATCH /products/{id}` para preços, nome, estado, etc.
- [ ] Tratar `422`/`404` e respeitar isolamento por `company_id`
