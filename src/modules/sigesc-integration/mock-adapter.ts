import type { AggregatePort } from "./port";
import type {
  AggregateCustomer,
  AggregateCustomerMutationResult,
  AggregateCustomersQuery,
  AggregateCustomerWriteInput,
  AggregateEnvelope,
  AggregateOnboardingData,
  AggregateOnboardingQuery,
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

let mockCustomerSeq = 600;
const mockCustomerStore: AggregateCustomer[] = structuredClone(MOCK_CUSTOMERS_FIXTURE);

export function resetMockCustomerStore(): void {
  mockCustomerStore.length = 0;
  mockCustomerStore.push(...structuredClone(MOCK_CUSTOMERS_FIXTURE));
  mockCustomerSeq = 600;
}

function authorize(apiKey: string, need: "onboarding" | "users" | "customers"): void {
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
        [c.name, c.surname, c.full_name, c.email, c.nif, c.customer_code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    const page = query?.page ?? 1;
    const perPage = Math.min(query?.per_page ?? 25, 100);
    const start = (page - 1) * perPage;
    return {
      success: true,
      data: items.slice(start, start + perPage),
      meta: {
        pagination: {
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
    if (!payload.company_id) {
      throw new AggregateApiError("Validation failed: company_id is required", 422, 422);
    }
    if (Number(payload.company_id) !== 44) {
      throw new AggregateApiError("company_id is not linked to this key", 422, 422);
    }
    const id = mockCustomerSeq++;
    const customer: AggregateCustomer = {
      id,
      company_id: Number(payload.company_id),
      name,
      surname: payload.surname ?? null,
      full_name: payload.surname ? `${name} ${payload.surname}` : name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      nif: payload.nif ?? null,
      customer_code: `CLI-${id}`,
      status: true,
      city: payload.city ?? null,
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
    };
    mockCustomerStore[idx] = updated;
    return { created: false, customer: structuredClone(updated) };
  }

  async fetchMe(apiKey: string): Promise<unknown> {
    authorize(apiKey, "onboarding");
    return {
      success: true,
      data: {
        key: MOCK_AGGREGATE_FIXTURE.key,
        company_ids: MOCK_AGGREGATE_FIXTURE.company_ids,
      },
    };
  }
}

export const MOCK_VALID_MCA_KEY = MOCK_KEY;
export const MOCK_REVOKED_MCA_KEY = MOCK_REVOKED;
export const MOCK_NOSCOPE_MCA_KEY = MOCK_NO_SCOPE;
export const MOCK_RATE_LIMIT_MCA_KEY = MOCK_RATE;
export const MOCK_TIMEOUT_MCA_KEY = MOCK_TIMEOUT;
export const MOCK_UNAVAILABLE_MCA_KEY = MOCK_UNAVAILABLE;
