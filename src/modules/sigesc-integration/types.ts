/** Types aligned with SIGESC Escolar Aggregate onboarding docs — no invented fields. */

export type AggregateAccessLevel = "admin" | "manager" | "user";

export type AggregateAddress = {
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country_id?: number | null;
};

export type AggregateUser = {
  id: number;
  external_id: string;
  company_id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email: string;
  state?: string | null;
  language?: string | null;
  role?: { id: number; name: string; level: AggregateAccessLevel };
  access_level: AggregateAccessLevel;
  created_at?: string;
  updated_at?: string;
};

export type AggregateCompany = {
  id: number;
  external_id: string;
  reference?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  city?: string | null;
  country?: string | null;
  country_id?: number | null;
  language?: string | null;
  timezone?: string | null;
  currency?: string | null;
  address?: AggregateAddress | null;
  is_owner?: boolean;
  users_count?: number;
  users?: AggregateUser[];
  created_at?: string;
  updated_at?: string;
};

export type AggregateKeyMeta = {
  id: number;
  name: string;
  prefix: string;
  owner_company_id: number;
  scopes: string[];
  status: string;
};

export type AggregateOnboardingData = {
  source?: {
    product?: string;
    api_version?: string;
    base_path?: string;
    module?: string;
    endpoint?: string;
  };
  key: AggregateKeyMeta;
  company_ids: number[];
  companies_count: number;
  companies: AggregateCompany[];
  suggested_bootstrap?: {
    purpose?: string;
    map_organization_by?: string[];
    map_users_by?: string[];
    role_mapping?: Record<string, string>;
    access_levels?: string[];
    notes?: string[];
  };
};

export type AggregateEnvelope<T> = {
  success: boolean;
  data?: T;
  meta?: { pagination?: AggregatePagination };
  error?: { message: string; code: number };
};

export type AggregatePagination = {
  page?: number;
  current_page?: number;
  per_page: number;
  total: number;
  last_page?: number;
};

export type AggregateUsersQuery = {
  company_id?: number | string;
  search?: string;
  state?: string;
  role?: string;
  role_level?: string;
  page?: number;
  per_page?: number;
};

export type AggregateOnboardingQuery = {
  company_id?: number | string;
  company_ids?: string;
};

export type AggregateCustomer = {
  id: number;
  company_id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  customer_code?: string | null;
  status?: boolean;
  city?: string | null;
  country_id?: number | null;
};

export type AggregateCustomersQuery = {
  company_id?: number | string;
  search?: string;
  q?: string;
  status?: string | number | boolean;
  page?: number;
  per_page?: number;
};

export type AggregateCustomerWriteInput = {
  company_id?: number | string;
  name?: string;
  nome?: string;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  city?: string | null;
  status?: string | boolean;
  customer?: AggregateCustomerWriteInput;
};

export type AggregateCustomerMutationResult = {
  created: boolean;
  customer: AggregateCustomer;
};

export class AggregateApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "AggregateApiError";
  }
}
