import type { AggregatePort } from "./port";
import type {
  AggregateCustomer,
  AggregateCustomerMutationResult,
  AggregateCustomersQuery,
  AggregateCustomerWriteInput,
  AggregateEnvelope,
  AggregateMeData,
  AggregateOnboardingData,
  AggregateOnboardingQuery,
  AggregatePaymentMethodsData,
  AggregateProduct,
  AggregateProductMutationResult,
  AggregateProductsQuery,
  AggregateProductWriteInput,
  AggregateSale,
  AggregateSaleCreateInput,
  AggregateSaleItemInput,
  AggregateSaleMutationResult,
  AggregateSalePayment,
  AggregateSalePaymentInput,
  AggregateSalePaymentResult,
  AggregateSalePublishInput,
  AggregateSalePublishResult,
  AggregateSalesQuery,
  AggregateUser,
  AggregateUsersQuery,
} from "./types";
import { AggregateApiError } from "./types";

const MOCK_KEY = "mca_mockvalidkeyforonboardingtestsxxxxxx";
const MOCK_REVOKED = "mca_mockrevokedkeyxxxxxxxxxxxxxxxxxxxx";
const MOCK_NO_SCOPE = "mca_mocknoscopekeyxxxxxxxxxxxxxxxxxxx";
const MOCK_RATE = "mca_mockratelimitkeyxxxxxxxxxxxxxxxxxx";
const MOCK_TIMEOUT = "mca_mocktimeoutkeyxxxxxxxxxxxxxxxxxxx";
const MOCK_UNAVAILABLE = "mca_mockunavailablekeyxxxxxxxxxxxxxxx";

export const MOCK_AGGREGATE_FIXTURE: AggregateOnboardingData = {
  source: {
    product: "sigesc",
    api_version: "v1",
    base_path: "/api/v1/aggregate",
    module: "multi_company",
    endpoint: "onboarding",
  },
  key: {
    id: 7,
    name: "Hotel Baía Mock",
    prefix: "mca_mock_valid",
    owner_company_id: 44,
    scopes: ["all"],
    status: "active",
  },
  company_ids: [44],
  companies_count: 1,
  companies: [
    {
      id: 44,
      external_id: "44",
      reference: 44,
      name: "Hotel Baía Atlântica Lda",
      email: "ops@baia-atlantica.ao",
      phone: "+244923000000",
      nif: "5000987654",
      city: "Luanda",
      country: "Angola",
      country_id: 1,
      language: "pt",
      timezone: "Africa/Luanda",
      currency: "AOA",
      address: {
        street: "Marginal de Luanda",
        number: "120",
        city: "Luanda",
        state: null,
        zip_code: null,
        country_id: 1,
      },
      is_owner: true,
      users_count: 3,
      users: [
        {
          id: 201,
          external_id: "201",
          company_id: 44,
          name: "Sofia",
          surname: "Mendes",
          full_name: "Sofia Mendes",
          email: "sofia@baia.ao",
          state: "active",
          language: "pt",
          role: { id: 1, name: "Admin", level: "admin" },
          access_level: "admin",
        },
        {
          id: 202,
          external_id: "202",
          company_id: 44,
          name: "Paulo",
          surname: "Rocha",
          full_name: "Paulo Rocha",
          email: "paulo@baia.ao",
          state: "active",
          language: "pt",
          role: { id: 3, name: "Manager", level: "manager" },
          access_level: "manager",
        },
        {
          id: 203,
          external_id: "203",
          company_id: 44,
          name: "Inês",
          surname: "Costa",
          full_name: "Inês Costa",
          email: "ines@baia.ao",
          state: "active",
          language: "pt",
          role: { id: 5, name: "User", level: "user" },
          access_level: "user",
        },
      ],
    },
  ],
  suggested_bootstrap: {
    purpose:
      "Bootstrap SIGESC Hotelaria from an existing SIGESC company without creating a new SIGESC account.",
    map_organization_by: ["external_id", "nif", "email"],
    map_users_by: ["email", "external_id"],
    role_mapping: { Admin: "admin", Manager: "manager", User: "user" },
    access_levels: ["admin", "manager", "user"],
    notes: [
      "Store company.external_id and user.external_id as the SIGESC identifiers.",
      "Passwords are never returned — Hotelaria sends its own invite flow.",
      "Reuse the same mca_ key for later Aggregate pulls.",
    ],
  },
};

export const MOCK_CUSTOMERS_FIXTURE: AggregateCustomer[] = [
  {
    id: 501,
    company_id: 44,
    name: "Carlos",
    surname: "Domingos",
    full_name: "Carlos Domingos",
    email: "carlos@exemplo.com",
    phone: "+244900111222",
    nif: "5000111222",
    customer_code: "CLI-501",
    status: true,
    city: "Luanda",
    country_id: 1,
  },
  {
    id: 502,
    company_id: 44,
    name: "Ana",
    surname: "Fernandes",
    full_name: "Ana Fernandes",
    email: "ana@exemplo.com",
    phone: "+244900333444",
    nif: "5000333444",
    customer_code: "CLI-502",
    status: true,
    city: "Benguela",
    country_id: 1,
  },
];

export const MOCK_PRODUCTS_FIXTURE: AggregateProduct[] = [
  {
    id: 901,
    company_id: 44,
    name: "Diária Standard",
    description: "Alojamento noite standard",
    code: "HOT-STAY",
    status: "active",
    sale_price: 45000,
    sale_price_ex_tax: 45000,
    tax_percent: 0,
    is_sellable: true,
    inventory: false,
    unit_of_measure: "noite",
    product_type: { id: 2, name: "Serviço" },
    kind: "service",
    stock_quantity: 0,
  },
  {
    id: 902,
    company_id: 44,
    name: "Pequeno-almoço",
    description: "Buffet pequeno-almoço",
    code: "HOT-BFST",
    status: "active",
    sale_price: 3500,
    sale_price_ex_tax: 3500,
    tax_percent: 0,
    is_sellable: true,
    inventory: false,
    unit_of_measure: "un",
    product_type: { id: 2, name: "Serviço" },
    kind: "service",
    stock_quantity: 0,
  },
  {
    id: 903,
    company_id: 44,
    name: "Água mineral 1.5L",
    description: "Produto minibar",
    code: "HOT-WATER",
    barcode: "5600000000001",
    status: "active",
    sale_price: 500,
    purchase_price: 200,
    tax_percent: 0,
    is_sellable: true,
    inventory: true,
    unit_of_measure: "un",
    product_type: { id: 1, name: "Artigo armagenavel" },
    kind: "product",
    stock_quantity: 48,
  },
];

export const MOCK_PAYMENT_METHODS_FIXTURE: AggregatePaymentMethodsData = {
  payment_methods: [
    {
      id: 1,
      company_id: 44,
      name: "Dinheiro",
      icon: "cash-default",
      is_cash: true,
      status: true,
      default_bank_account_id: 10,
      bank_accounts: [{ id: 10, name: "Caixa Principal", reference: "CASH-44", is_cash: true }],
    },
    {
      id: 2,
      company_id: 44,
      name: "Multicaixa TPA",
      icon: null,
      is_cash: false,
      status: true,
      default_bank_account_id: 11,
      bank_accounts: [
        {
          id: 11,
          name: "Banco BAI Operações",
          reference: "BAI-44",
          iban: "AO06004000001234567890123",
          is_cash: false,
        },
      ],
    },
    {
      id: 3,
      company_id: 44,
      name: "Transferência Bancária",
      icon: null,
      is_cash: false,
      status: true,
      default_bank_account_id: 11,
      bank_accounts: [
        {
          id: 11,
          name: "Banco BAI Operações",
          reference: "BAI-44",
          iban: "AO06004000001234567890123",
          is_cash: false,
        },
      ],
    },
  ],
  bank_accounts: [
    { id: 10, company_id: 44, name: "Caixa Principal", reference: "CASH-44", is_cash: true },
    {
      id: 11,
      company_id: 44,
      name: "Banco BAI Operações",
      reference: "BAI-44",
      iban: "AO06004000001234567890123",
      is_cash: false,
    },
  ],
};

let mockCustomerSeq = 600;
const mockCustomerStore: AggregateCustomer[] = structuredClone(MOCK_CUSTOMERS_FIXTURE);
let mockProductSeq = 1000;
const mockProductStore: AggregateProduct[] = structuredClone(MOCK_PRODUCTS_FIXTURE);
let mockSaleSeq = 100;
let mockPaymentSeq = 1;
let mockDocSeq = 1;
const mockSaleStore: AggregateSale[] = [];
/** external_id → sale id */
const mockSaleByExternal = new Map<string, number>();
const mockAppendKeys = new Set<string>();
const mockPublishKeys = new Map<string, number>();
const mockPaymentKeys = new Map<string, { saleId: number; payment: AggregateSalePayment; payloadSig: string }>();

export function resetMockCustomerStore(): void {
  mockCustomerStore.length = 0;
  mockCustomerStore.push(...structuredClone(MOCK_CUSTOMERS_FIXTURE));
  mockCustomerSeq = 600;
}

export function resetMockProductStore(): void {
  mockProductStore.length = 0;
  mockProductStore.push(...structuredClone(MOCK_PRODUCTS_FIXTURE));
  mockProductSeq = 1000;
}

export function resetMockSaleStore(): void {
  mockSaleStore.length = 0;
  mockSaleByExternal.clear();
  mockAppendKeys.clear();
  mockPublishKeys.clear();
  mockPaymentKeys.clear();
  mockSaleSeq = 100;
  mockPaymentSeq = 1;
  mockDocSeq = 1;
}

export function resetAllMockAggregateStores(): void {
  resetMockCustomerStore();
  resetMockProductStore();
  resetMockSaleStore();
}

type ScopeNeed = "onboarding" | "users" | "customers" | "products" | "sales" | "payments";

function authorize(apiKey: string, need: ScopeNeed): void {
  const key = apiKey.trim();
  if (!key || key === MOCK_REVOKED) {
    throw new AggregateApiError("Unauthorized: key missing, invalid or revoked", 401, 401);
  }
  if (key === MOCK_RATE) throw new AggregateApiError("Too many requests", 429, 429);
  if (key === MOCK_TIMEOUT) {
    throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
  }
  if (key === MOCK_UNAVAILABLE) {
    throw new AggregateApiError("SIGESC Aggregate unavailable: network error", 503, 503);
  }
  if (key === MOCK_NO_SCOPE) {
    throw new AggregateApiError(`Forbidden: scope ${need} required`, 403, 403);
  }
  if (key !== MOCK_KEY) {
    throw new AggregateApiError("Unauthorized: invalid Aggregate key", 401, 401);
  }
}

function isServiceProduct(p: AggregateProduct): boolean {
  const kind = (p.kind ?? "").toLowerCase();
  if (kind === "service" || kind === "servico") return true;
  if (kind === "product" || kind === "pharmacy" || kind === "produto") return false;
  const typeName =
    typeof p.product_type === "string"
      ? p.product_type
      : (p.product_type?.name ?? "");
  return /servi[cç]o/i.test(typeName);
}

function assertCompanyLinked(companyId: number | string | undefined): number {
  if (companyId === undefined || companyId === null || companyId === "") {
    throw new AggregateApiError(
      "company_id is required and must be linked to this Aggregate key",
      422,
      422,
    );
  }
  const id = Number(companyId);
  if (id !== 44) {
    throw new AggregateApiError("company_id is not linked to this key", 422, 422);
  }
  return id;
}

function normalizeSaleState(raw?: string): string {
  if (!raw) return "Cotação";
  const s = raw.trim().toLowerCase();
  if (s === "cotação" || s === "cotacao" || s === "draft" || s === "quote") return "Cotação";
  if (s === "proforma") return "Proforma";
  if (s === "publicado" || s === "pago" || s === "published" || s === "paid") {
    throw new AggregateApiError(
      "API create only allows Cotação or Proforma. Publish and pay inside SIGESC.",
      422,
      422,
    );
  }
  throw new AggregateApiError(
    "API create only allows Cotação or Proforma. Publish and pay inside SIGESC.",
    422,
    422,
  );
}

function resolveSaleItems(body: AggregateSaleCreateInput): AggregateSaleItemInput[] {
  const items = body.items ?? body.lines ?? [];
  if ((!items || items.length === 0) && !body.allow_empty_items) {
    throw new AggregateApiError(
      "At least one item is required. List catalog with GET /products first.",
      422,
      422,
    );
  }
  return items;
}

function buildSaleFromInput(body: AggregateSaleCreateInput, saleId: number): AggregateSale {
  const companyId = assertCompanyLinked(body.company_id);
  const state = normalizeSaleState(body.state);
  const itemsIn = resolveSaleItems(body);
  const saleItems = itemsIn.map((raw, idx) => {
    const productId = Number(raw.product_id ?? raw.id ?? raw.produtos_id);
    const product = mockProductStore.find((p) => p.id === productId && p.company_id === companyId);
    if (!product) {
      throw new AggregateApiError(
        `Product #${productId} not found for this company. List catalog with GET /products first.`,
        422,
        422,
      );
    }
    const quantity = Number(raw.quantity ?? raw.qty ?? 1);
    const unitPrice = Number(
      raw.unit_price ?? raw.price ?? raw.sale_price ?? product.sale_price ?? 0,
    );
    const discount = Number(raw.discount ?? 0);
    const taxPercent = Number(product.tax_percent ?? 0);
    const net = unitPrice * quantity - discount;
    const taxAmount = net * (taxPercent / 100);
    return {
      id: idx + 1,
      quantity,
      unit_price: unitPrice,
      discount,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      line_total: net + taxAmount,
      product: {
        id: product.id,
        name: product.name,
        code: product.code ?? undefined,
        sale_price: product.sale_price ?? undefined,
      },
    };
  });

  const subtotal = saleItems.reduce(
    (acc, i) => acc + (i.unit_price * i.quantity - i.discount),
    0,
  );
  const tax = saleItems.reduce((acc, i) => acc + i.tax_amount, 0);
  const total = subtotal + tax;

  const customerId = body.customer_id ?? body.costumer_id;
  let customerName = body.customer_name ?? body.customer?.name;
  let customerEmail = body.customer_email ?? body.customer?.email;
  if (customerId) {
    const existing = mockCustomerStore.find(
      (c) => c.id === Number(customerId) && c.company_id === companyId,
    );
    if (!existing) {
      throw new AggregateApiError("Customer not found for this company.", 422, 422);
    }
    customerName = existing.full_name ?? existing.name;
    customerEmail = existing.email ?? undefined;
  }

  const externalId = body.external_id ?? body.external_reference ?? null;

  return {
    id: saleId,
    sale_key: `billing-${saleId}`,
    source: "billing",
    company_id: companyId,
    order_reference: externalId,
    state,
    total,
    subtotal,
    tax,
    rest_payable: total,
    date: body.date ?? body.document_date ?? body.date_order ?? new Date().toISOString().slice(0, 10),
    date_due: body.date_due ?? body.date ?? new Date().toISOString().slice(0, 10),
    customer: customerId
      ? {
          id: Number(customerId),
          name: customerName ?? "Cliente",
          email: customerEmail ?? null,
        }
      : customerName
        ? { name: customerName, email: customerEmail ?? null }
        : null,
    items: saleItems,
    payments: [],
  };
}

export class MockAggregateAdapter implements AggregatePort {
  async fetchOnboarding(
    apiKey: string,
    query?: AggregateOnboardingQuery,
  ): Promise<AggregateOnboardingData> {
    authorize(apiKey, "onboarding");
    const data = structuredClone(MOCK_AGGREGATE_FIXTURE);
    if (query?.company_id) {
      const id = String(query.company_id);
      const filtered = data.companies.filter(
        (c) => String(c.id) === id || c.external_id === id,
      );
      if (filtered.length === 0) {
        throw new AggregateApiError("company_id is not linked to this key", 422, 422);
      }
      data.companies = filtered;
      data.company_ids = filtered.map((c) => c.id);
      data.companies_count = filtered.length;
    }
    return data;
  }

  async fetchUsers(
    apiKey: string,
    query?: AggregateUsersQuery,
  ): Promise<AggregateEnvelope<AggregateUser[]>> {
    authorize(apiKey, "users");
    let users = MOCK_AGGREGATE_FIXTURE.companies.flatMap((c) => c.users ?? []);
    if (query?.company_id) {
      const id = Number(query.company_id);
      users = users.filter((u) => u.company_id === id);
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          (u.surname ?? "").toLowerCase().includes(q),
      );
    }
    const page = query?.page ?? 1;
    const perPage = Math.min(query?.per_page ?? 25, 100);
    const start = (page - 1) * perPage;
    return {
      success: true,
      data: users.slice(start, start + perPage),
      meta: {
        pagination: {
          page,
          per_page: perPage,
          total: users.length,
          last_page: Math.max(1, Math.ceil(users.length / perPage)),
        },
      },
    };
  }

  async listCustomers(
    apiKey: string,
    query?: AggregateCustomersQuery,
  ): Promise<AggregateEnvelope<AggregateCustomer[]>> {
    authorize(apiKey, "customers");
    let items = [...mockCustomerStore];
    if (query?.company_id) {
      items = items.filter((c) => c.company_id === Number(query.company_id));
    }
    const term = (query?.search || query?.q || "").toLowerCase().trim();
    if (term) {
      items = items.filter((c) =>
        [c.name, c.surname, c.full_name, c.email, c.nif, c.customer_code, c.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    if (query?.status !== undefined && query.status !== "") {
      const active =
        query.status === true ||
        query.status === 1 ||
        query.status === "1" ||
        String(query.status).toLowerCase() === "active" ||
        String(query.status).toLowerCase() === "true";
      items = items.filter((c) => Boolean(c.status) === active);
    }
    const page = query?.page ?? 1;
    const perPage = Math.min(query?.per_page ?? 25, 100);
    const start = (page - 1) * perPage;
    return {
      success: true,
      data: items.slice(start, start + perPage),
      meta: {
        pagination: {
          current_page: page,
          page,
          per_page: perPage,
          total: items.length,
          last_page: Math.max(1, Math.ceil(items.length / perPage)),
        },
      },
    };
  }

  async getCustomer(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateCustomer> {
    authorize(apiKey, "customers");
    const customer = mockCustomerStore.find((c) => c.id === Number(id));
    if (!customer) throw new AggregateApiError("Customer not found", 404, 404);
    if (query?.company_id && Number(query.company_id) !== customer.company_id) {
      throw new AggregateApiError("Customer not found", 404, 404);
    }
    return structuredClone(customer);
  }

  async createCustomer(
    apiKey: string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    authorize(apiKey, "customers");
    const payload = body.customer ? { ...body, ...body.customer } : body;
    const name = (payload.name || payload.nome || "").trim();
    if (!name) throw new AggregateApiError("Validation failed: name is required", 422, 422);
    const companyId = assertCompanyLinked(payload.company_id);

    if (payload.email) {
      const dup = mockCustomerStore.find(
        (c) => c.company_id === companyId && c.email?.toLowerCase() === payload.email!.toLowerCase(),
      );
      if (dup) throw new AggregateApiError("Validation failed: email already exists", 422, 422);
    }
    if (payload.nif) {
      const dup = mockCustomerStore.find(
        (c) => c.company_id === companyId && c.nif === payload.nif,
      );
      if (dup) throw new AggregateApiError("Validation failed: nif already exists", 422, 422);
    }
    if (payload.customer_code) {
      const dup = mockCustomerStore.find(
        (c) => c.company_id === companyId && c.customer_code === payload.customer_code,
      );
      if (dup) {
        throw new AggregateApiError("Validation failed: customer_code already exists", 422, 422);
      }
    }

    const id = mockCustomerSeq++;
    const customer: AggregateCustomer = {
      id,
      company_id: companyId,
      name,
      surname: payload.surname ?? null,
      full_name: payload.surname ? `${name} ${payload.surname}` : name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      nif: payload.nif ?? null,
      customer_code: payload.customer_code ?? `CLI-${id}`,
      status: payload.status === undefined ? true : Boolean(payload.status),
      city: payload.city ?? null,
      country_id: payload.country_id ?? 1,
    };
    mockCustomerStore.push(customer);
    return { created: true, customer: structuredClone(customer) };
  }

  async updateCustomer(
    apiKey: string,
    id: number | string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    authorize(apiKey, "customers");
    const payload = body.customer ? { ...body, ...body.customer } : body;
    const idx = mockCustomerStore.findIndex((c) => c.id === Number(id));
    if (idx < 0) throw new AggregateApiError("Customer not found", 404, 404);
    const keys = Object.keys(payload).filter((k) => k !== "company_id" && k !== "customer");
    if (keys.length === 0) {
      throw new AggregateApiError("Validation failed: no fields to update", 422, 422);
    }
    const current = mockCustomerStore[idx]!;
    const name = payload.name || payload.nome || current.name;
    const surname = payload.surname !== undefined ? payload.surname : current.surname;
    const updated: AggregateCustomer = {
      ...current,
      name,
      surname,
      full_name: surname ? `${name} ${surname}` : name,
      email: payload.email !== undefined ? payload.email : current.email,
      phone: payload.phone !== undefined ? payload.phone : current.phone,
      nif: payload.nif !== undefined ? payload.nif : current.nif,
      city: payload.city !== undefined ? payload.city : current.city,
      customer_code:
        payload.customer_code !== undefined ? payload.customer_code : current.customer_code,
      status: payload.status !== undefined ? Boolean(payload.status) : current.status,
    };
    mockCustomerStore[idx] = updated;
    return { created: false, customer: structuredClone(updated) };
  }

  async listProducts(
    apiKey: string,
    query?: AggregateProductsQuery,
  ): Promise<AggregateEnvelope<AggregateProduct[]>> {
    authorize(apiKey, "products");
    let items = [...mockProductStore];
    if (query?.company_id) {
      items = items.filter((p) => p.company_id === Number(query.company_id));
    }
    const kind = (query?.kind || query?.catalog || "all").toLowerCase();
    if (kind === "service" || kind === "servico") {
      items = items.filter((p) => isServiceProduct(p));
    } else if (kind === "product" || kind === "pharmacy" || kind === "produto") {
      items = items.filter((p) => !isServiceProduct(p));
    }
    const term = (query?.search || query?.q || "").toLowerCase().trim();
    if (term) {
      items = items.filter((p) =>
        [p.name, p.code, p.reference, p.description, p.barcode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    if (query?.status) {
      items = items.filter((p) => String(p.status).toLowerCase() === String(query.status).toLowerCase());
    }
    if (query?.category_id) {
      items = items.filter((p) => p.category_id === Number(query.category_id));
    }
    const page = query?.page ?? 1;
    const perPage = Math.min(query?.per_page ?? 25, 100);
    const start = (page - 1) * perPage;
    return {
      success: true,
      data: items.slice(start, start + perPage).map((p) => structuredClone(p)),
      meta: {
        pagination: {
          current_page: page,
          page,
          per_page: perPage,
          total: items.length,
          last_page: Math.max(1, Math.ceil(items.length / perPage)),
        },
      },
    };
  }

  async getProduct(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateProduct> {
    authorize(apiKey, "products");
    const product = mockProductStore.find((p) => p.id === Number(id));
    if (!product) throw new AggregateApiError("Product not found", 404, 404);
    if (query?.company_id && Number(query.company_id) !== product.company_id) {
      throw new AggregateApiError("Product not found", 404, 404);
    }
    return structuredClone(product);
  }

  async createProduct(
    apiKey: string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult> {
    authorize(apiKey, "products");
    const name = (body.name || "").trim();
    if (!name) throw new AggregateApiError("Validation failed: name is required", 422, 422);
    const companyId = assertCompanyLinked(body.company_id);
    const kind = (body.kind || "product").toLowerCase();
    const id = mockProductSeq++;
    // Angola simplified regime mock: force 0% tax when applicable
    const taxPercent = 0;
    const product: AggregateProduct = {
      id,
      company_id: companyId,
      name,
      description: body.description ?? null,
      code: body.code ?? null,
      barcode: body.barcode ?? null,
      reference: body.reference ?? null,
      status: body.status ?? "active",
      sale_price: body.sale_price ?? 0,
      sale_price_ex_tax: body.sale_price_ex_tax ?? body.sale_price ?? 0,
      purchase_price: body.purchase_price ?? null,
      purchase_price_ex_tax: body.purchase_price_ex_tax ?? null,
      tax_percent: taxPercent,
      inventory: body.inventory ?? kind === "product",
      is_sellable: body.is_sellable ?? true,
      unit_of_measure: body.unit_of_measure ?? "un",
      pricing_mode: body.pricing_mode ?? null,
      category_id: body.category_id ?? null,
      product_type:
        kind === "service" || kind === "servico"
          ? { id: 2, name: "Serviço" }
          : { id: 1, name: "Artigo armagenavel" },
      kind: kind === "service" || kind === "servico" ? "service" : "product",
      stock_quantity: 0,
    };
    mockProductStore.push(product);
    return { created: true, product: structuredClone(product) };
  }

  async updateProduct(
    apiKey: string,
    id: number | string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult> {
    authorize(apiKey, "products");
    const idx = mockProductStore.findIndex((p) => p.id === Number(id));
    if (idx < 0) throw new AggregateApiError("Product not found", 404, 404);
    const keys = Object.keys(body).filter((k) => k !== "company_id");
    if (keys.length === 0) {
      throw new AggregateApiError("Validation failed: no fields to update", 422, 422);
    }
    const current = mockProductStore[idx]!;
    const updated: AggregateProduct = {
      ...current,
      name: body.name ?? current.name,
      description: body.description !== undefined ? body.description : current.description,
      code: body.code !== undefined ? body.code : current.code,
      barcode: body.barcode !== undefined ? body.barcode : current.barcode,
      reference: body.reference !== undefined ? body.reference : current.reference,
      sale_price: body.sale_price !== undefined ? body.sale_price : current.sale_price,
      sale_price_ex_tax:
        body.sale_price_ex_tax !== undefined ? body.sale_price_ex_tax : current.sale_price_ex_tax,
      purchase_price:
        body.purchase_price !== undefined ? body.purchase_price : current.purchase_price,
      status: body.status !== undefined ? body.status : current.status,
      is_sellable: body.is_sellable !== undefined ? body.is_sellable : current.is_sellable,
      unit_of_measure:
        body.unit_of_measure !== undefined ? body.unit_of_measure : current.unit_of_measure,
      // company_id ignored on update; tax forced 0 in simplified regime mock
      tax_percent: 0,
      company_id: current.company_id,
    };
    mockProductStore[idx] = updated;
    return { created: false, product: structuredClone(updated) };
  }

  async createSale(
    apiKey: string,
    body: AggregateSaleCreateInput,
  ): Promise<{ httpStatus: number; result: AggregateSaleMutationResult }> {
    authorize(apiKey, "sales");
    assertCompanyLinked(body.company_id);
    const externalId = body.external_id ?? body.external_reference;
    if (externalId && mockSaleByExternal.has(externalId)) {
      const existingId = mockSaleByExternal.get(externalId)!;
      const sale = mockSaleStore.find((s) => s.id === existingId)!;
      return {
        httpStatus: 200,
        result: {
          created: false,
          idempotent: true,
          hint: "Existing invoice returned for external_id (idempotent).",
          sale: structuredClone(sale),
        },
      };
    }

    // Simulated ambiguous timeout AFTER remote create — client never saw the response.
    // A safe retry with the same external_id returns the existing sale (idempotent).
    if (externalId?.endsWith("-AMBIGUOUS-TIMEOUT")) {
      if (!mockSaleByExternal.has(externalId)) {
        const saleId = mockSaleSeq++;
        const sale = buildSaleFromInput(body, saleId);
        mockSaleStore.push(sale);
        mockSaleByExternal.set(externalId, saleId);
      }
      throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
    }

    const saleId = mockSaleSeq++;
    const sale = buildSaleFromInput(body, saleId);
    mockSaleStore.push(sale);
    if (externalId) mockSaleByExternal.set(externalId, saleId);

    return {
      httpStatus: 201,
      result: {
        created: true,
        idempotent: false,
        hint: "Invoice created as Cotação/Proforma. Publish and take payment inside SIGESC (stock + fiscal). Use sale_key for later GET /sales/{sale_key} or POST …/items.",
        sale: structuredClone(sale),
      },
    };
  }

  async getSale(apiKey: string, saleKey: string): Promise<AggregateSale> {
    authorize(apiKey, "sales");
    const idMatch = String(saleKey).match(/(\d+)$/);
    const id = idMatch ? Number(idMatch[1]) : Number(saleKey);
    const sale = mockSaleStore.find((s) => s.id === id || s.sale_key === saleKey);
    if (!sale) throw new AggregateApiError("Sale not found", 404, 404);
    return structuredClone(sale);
  }

  async listSales(
    apiKey: string,
    query?: AggregateSalesQuery,
  ): Promise<AggregateEnvelope<AggregateSale[]>> {
    authorize(apiKey, "sales");
    let items = [...mockSaleStore];
    if (query?.company_id) {
      items = items.filter((s) => s.company_id === Number(query.company_id));
    }
    if (query?.source) {
      items = items.filter((s) => s.source === query.source);
    }
    if (query?.state) {
      items = items.filter((s) => s.state === query.state);
    }
    const page = query?.page ?? 1;
    const perPage = Math.min(query?.per_page ?? 25, 100);
    const start = (page - 1) * perPage;
    return {
      success: true,
      data: items.slice(start, start + perPage).map((s) => structuredClone(s)),
      meta: {
        pagination: {
          current_page: page,
          page,
          per_page: perPage,
          total: items.length,
          last_page: Math.max(1, Math.ceil(items.length / perPage)),
        },
      },
    };
  }

  async addSaleItems(
    apiKey: string,
    saleKey: string,
    items: AggregateSaleItemInput[],
    options?: { idempotencyKey?: string },
  ): Promise<AggregateSale> {
    authorize(apiKey, "sales");
    const sale = await this.getSale(apiKey, saleKey);
    const idempotencyKey = options?.idempotencyKey?.trim();
    if (idempotencyKey && mockAppendKeys.has(`${sale.id}:${idempotencyKey}`)) {
      return structuredClone(sale);
    }
    if (sale.state !== "Cotação" && sale.state !== "Proforma") {
      throw new AggregateApiError("Sale is not editable in this state", 422, 422);
    }
    if (!items.length) {
      throw new AggregateApiError("At least one item is required", 422, 422);
    }
    const patch = buildSaleFromInput(
      {
        company_id: sale.company_id,
        state: sale.state,
        items,
      },
      sale.id,
    );
    const idx = mockSaleStore.findIndex((s) => s.id === sale.id);
    const merged: AggregateSale = {
      ...sale,
      items: [
        ...(sale.items ?? []),
        ...(patch.items ?? []).map((it, i) => ({
          ...it,
          id: (sale.items?.length ?? 0) + i + 1,
        })),
      ],
      total: Number(((sale.total ?? 0) + (patch.total ?? 0)).toFixed(2)),
      subtotal: Number(((sale.subtotal ?? 0) + (patch.subtotal ?? 0)).toFixed(2)),
      tax: Number(((sale.tax ?? 0) + (patch.tax ?? 0)).toFixed(2)),
      rest_payable: Number(((sale.rest_payable ?? 0) + (patch.rest_payable ?? 0)).toFixed(2)),
    };
    mockSaleStore[idx] = merged;
    if (idempotencyKey) mockAppendKeys.add(`${sale.id}:${idempotencyKey}`);
    return structuredClone(merged);
  }

  async listPaymentMethods(
    apiKey: string,
    query?: { company_id?: number | string },
  ): Promise<AggregatePaymentMethodsData> {
    authorize(apiKey, "sales");
    if (query?.company_id !== undefined && query.company_id !== "") {
      assertCompanyLinked(query.company_id);
    }
    return structuredClone(MOCK_PAYMENT_METHODS_FIXTURE);
  }

  async publishSale(
    apiKey: string,
    saleKey: string,
    body?: AggregateSalePublishInput,
  ): Promise<{ httpStatus: number; result: AggregateSalePublishResult }> {
    authorize(apiKey, "sales");
    const sale = await this.getSale(apiKey, saleKey);
    const idx = mockSaleStore.findIndex((s) => s.id === sale.id);
    const idemKey = body?.idempotency_key?.trim();

    if (idemKey && mockPublishKeys.has(idemKey)) {
      const prevSaleId = mockPublishKeys.get(idemKey)!;
      if (prevSaleId !== sale.id) {
        throw new AggregateApiError("Idempotency key was already used for a different sale.", 409, 409);
      }
      return {
        httpStatus: 200,
        result: {
          published: false,
          idempotent: true,
          document_number: sale.document_number ?? null,
          sale: structuredClone(sale),
        },
      };
    }

    if (sale.state !== "Cotação" && sale.state !== "Proforma") {
      throw new AggregateApiError(
        `Invoice cannot be published from state "${sale.state}".`,
        409,
        409,
      );
    }

    const prefix =
      body?.document_type === "advance" || body?.document_type === "FA"
        ? "FA"
        : body?.document_type === "global" || body?.document_type === "FG"
          ? "FG"
          : body?.document_type === "generic" || body?.document_type === "GF"
            ? "GF"
            : "FT";
    const year = new Date().getFullYear();
    const docNo = `${prefix} SG${year}/${mockDocSeq++}`;

    const published: AggregateSale = {
      ...sale,
      document_number: docNo,
      order_number: docNo,
      document_type: prefix,
      state: "Publicado",
      payment_status: "unpaid",
      rest_payable: sale.total ?? 0,
      collected: 0,
      confirmed_at: new Date().toISOString(),
    };
    mockSaleStore[idx] = published;
    if (idemKey) mockPublishKeys.set(idemKey, sale.id);

    if (idemKey?.endsWith("-AMBIGUOUS-TIMEOUT")) {
      throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
    }

    return {
      httpStatus: 200,
      result: {
        published: true,
        idempotent: false,
        document_number: docNo,
        sale: structuredClone(published),
      },
    };
  }

  async recordSalePayment(
    apiKey: string,
    saleKey: string,
    body: AggregateSalePaymentInput,
  ): Promise<{ httpStatus: number; result: AggregateSalePaymentResult }> {
    authorize(apiKey, "sales");
    const sale = await this.getSale(apiKey, saleKey);
    const idx = mockSaleStore.findIndex((s) => s.id === sale.id);
    const idemKey = (body.idempotency_key || body.external_payment_id || "").trim();
    if (!idemKey) {
      throw new AggregateApiError("idempotency_key is required for sale payments", 422, 422);
    }

    const amount = Number(Number(body.amount).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AggregateApiError("amount must be greater than 0.", 422, 422);
    }

    const payloadSig = `${sale.id}:${amount.toFixed(2)}:${body.payment_method_id}`;
    const prior = mockPaymentKeys.get(idemKey);
    if (prior) {
      if (prior.saleId !== sale.id || prior.payloadSig !== payloadSig) {
        throw new AggregateApiError(
          "Payment idempotency key reused with a different sale, amount or payment method.",
          409,
          409,
        );
      }
      return {
        httpStatus: 200,
        result: {
          created: false,
          idempotent: true,
          payment: structuredClone(prior.payment),
          sale: structuredClone(sale),
        },
      };
    }

    if (sale.state === "Anulado" || sale.state === "Cancelado") {
      throw new AggregateApiError("Cannot record payment on cancelled invoice.", 409, 409);
    }
    if (sale.state === "Pago" || (sale.rest_payable ?? 0) <= 0.004) {
      throw new AggregateApiError("Invoice is already fully paid.", 409, 409);
    }
    if (sale.state === "Cotação" || sale.state === "Proforma") {
      throw new AggregateApiError(
        "Invoice must be published before recording payments.",
        409,
        409,
      );
    }

    const method = MOCK_PAYMENT_METHODS_FIXTURE.payment_methods.find(
      (m) => m.id === Number(body.payment_method_id),
    );
    if (!method) {
      throw new AggregateApiError("Payment method not found or inactive for this company.", 422, 422);
    }

    const currentRest = Number((sale.rest_payable ?? sale.total ?? 0).toFixed(2));
    if (amount > currentRest + 0.005) {
      throw new AggregateApiError(
        `Payment amount (${amount}) exceeds remaining payable balance (${currentRest}).`,
        422,
        422,
      );
    }

    const remaining = Number(Math.max(0, currentRest - amount).toFixed(2));
    const isPaid = remaining <= 0.005;
    const nextRest = isPaid ? 0 : remaining;
    const nextCollected = Number(((sale.total ?? 0) - nextRest).toFixed(2));

    const paymentId = mockPaymentSeq++;
    const year = new Date().getFullYear();
    const payment: AggregateSalePayment = {
      id: paymentId,
      amount,
      remaining_payable: nextRest,
      total_payments: nextRest,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      status: "completed",
      type: body.type ?? "payment",
      number: `RC SG${year}/${paymentId}`,
      notes: [body.reference ? `Ref: ${body.reference}` : null, body.notes ?? null]
        .filter(Boolean)
        .join(" · ") || null,
      bank_account_id: body.bank_account_id ?? method.default_bank_account_id ?? null,
      idempotency_key: idemKey,
      method: { id: method.id, name: method.name },
    };

    const updated: AggregateSale = {
      ...sale,
      state: isPaid ? "Pago" : "Publicado",
      payment_status: isPaid ? "paid" : "partial",
      rest_payable: nextRest,
      collected: nextCollected,
      payments: [...(sale.payments ?? []), payment],
      payments_count: (sale.payments?.length ?? 0) + 1,
    };
    mockSaleStore[idx] = updated;
    mockPaymentKeys.set(idemKey, { saleId: sale.id, payment, payloadSig });

    if (idemKey.endsWith("-AMBIGUOUS-TIMEOUT")) {
      throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
    }

    return {
      httpStatus: 201,
      result: {
        created: true,
        idempotent: false,
        payment: structuredClone(payment),
        sale: structuredClone(updated),
      },
    };
  }

  async fetchMe(apiKey: string): Promise<AggregateMeData> {
    authorize(apiKey, "onboarding");
    return {
      key: structuredClone(MOCK_AGGREGATE_FIXTURE.key),
      owner_company_id: MOCK_AGGREGATE_FIXTURE.key.owner_company_id,
      company_ids: [...MOCK_AGGREGATE_FIXTURE.company_ids],
      companies: MOCK_AGGREGATE_FIXTURE.companies.map((c) => ({
        id: c.id,
        name: c.name,
        reference: c.reference ?? c.id,
        email: c.email ?? null,
        nif: c.nif ?? null,
        platform_status: "active",
        is_owner: Boolean(c.is_owner),
        role: c.is_owner ? "owner" : "linked",
      })),
    };
  }
}

export const MOCK_VALID_MCA_KEY = MOCK_KEY;
export const MOCK_REVOKED_MCA_KEY = MOCK_REVOKED;
export const MOCK_NOSCOPE_MCA_KEY = MOCK_NO_SCOPE;
export const MOCK_RATE_LIMIT_MCA_KEY = MOCK_RATE;
export const MOCK_TIMEOUT_MCA_KEY = MOCK_TIMEOUT;
export const MOCK_UNAVAILABLE_MCA_KEY = MOCK_UNAVAILABLE;
