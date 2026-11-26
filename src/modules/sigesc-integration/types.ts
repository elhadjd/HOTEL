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
  reference?: string | null;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  address?: string | null;
  customer_code?: string | null;
  customer_type?: string | null;
  status?: boolean;
  city?: string | null;
  province?: string | null;
  country_id?: number | null;
  country?: { id: number; name?: string | null; code?: string | null } | null;
  credit_limit?: number | null;
  account_balance?: number | null;
  birth_date?: string | null;
  sex?: string | null;
  image?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AggregateCustomersQuery = {
  company_id?: number | string;
  company_ids?: string;
  company_reference?: number | string;
  company_references?: string;
  search?: string;
  q?: string;
  status?: string | number | boolean;
  per_page?: number;
  page?: number;
  sort?: string;
  direction?: string;
  date_from?: string;
  date_to?: string;
};

export type AggregateCustomerWriteInput = {
  company_id?: number | string;
  name?: string;
  nome?: string;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  country_id?: number | null;
  customer_type?: string | null;
  customer_code?: string | null;
  credit_limit?: number | null;
  account_balance?: number | null;
  terms_payment_id?: number | null;
  birth_date?: string | null;
  sex?: string | null;
  image?: string | null;
  reference?: string | null;
  status?: string | boolean;
  customer?: AggregateCustomerWriteInput;
};

export type AggregateCustomerMutationResult = {
  created: boolean;
  customer: AggregateCustomer;
};

export type AggregateProduct = {
  id: number;
  company_id: number;
  name: string;
  description?: string | null;
  code?: string | null;
  reference?: string | null;
  barcode?: string | null;
  status?: string | boolean | null;
  sale_price?: number | null;
  price?: number | null;
  sale_price_ex_tax?: number | null;
  purchase_price?: number | null;
  purchase_price_ex_tax?: number | null;
  tax_percent?: number | null;
  inventory?: boolean | null;
  is_sellable?: boolean | null;
  unit_of_measure?: string | null;
  pricing_mode?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  product_type?: { id?: number; name?: string } | string | null;
  stock_quantity?: number | null;
  created_at?: string;
  updated_at?: string;
  kind?: string | null;
};

export type AggregateProductsQuery = {
  company_id?: number | string;
  company_ids?: string;
  company_reference?: number | string;
  company_references?: string;
  search?: string;
  q?: string;
  kind?: string;
  catalog?: string;
  status?: string;
  category_id?: number | string;
  product_type_id?: number | string;
  per_page?: number;
  page?: number;
  sort?: string;
  direction?: string;
  date_from?: string;
  date_to?: string;
};

export type AggregateProductWriteInput = {
  company_id?: number | string;
  name?: string;
  kind?: string;
  product_type_id?: number | string;
  description?: string | null;
  code?: string | null;
  barcode?: string | null;
  reference?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  sale_price_ex_tax?: number | null;
  purchase_price_ex_tax?: number | null;
  tax_percent?: number | null;
  tax_rate_id?: number | null;
  status?: string | boolean;
  category_id?: number | null;
  is_sellable?: boolean;
  inventory?: boolean;
  allow_backorder?: boolean;
  unit_of_measure?: string | null;
  pricing_mode?: string | null;
  min_quantity?: number | null;
  manufacturer?: string | null;
  image?: string | null;
  tax_exception_code?: string | null;
  tax_exception_reason?: string | null;
};

export type AggregateProductMutationResult = {
  created: boolean;
  product: AggregateProduct;
};

/** Documented invoice states creatable via Aggregate */
export type AggregateSaleCreatableState = "Cotação" | "Proforma";

export type AggregateSaleItemInput = {
  product_id: number | string;
  id?: number | string;
  produtos_id?: number | string;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  price?: number;
  sale_price?: number;
  discount?: number;
  description?: string;
  warehouse_id?: number | string;
};

export type AggregateSaleCreateInput = {
  company_id: number | string;
  items?: AggregateSaleItemInput[];
  lines?: AggregateSaleItemInput[];
  external_id?: string;
  external_reference?: string;
  partner?: string;
  state?: string;
  date?: string;
  document_date?: string;
  date_order?: string;
  date_due?: string;
  warehouse_id?: number | string;
  customer_id?: number | string;
  costumer_id?: number | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_nif?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    nif?: string;
  };
  notes?: string;
  allow_empty_items?: boolean;
};

export type AggregateSaleItem = {
  id?: number;
  quantity?: number;
  unit_price?: number;
  discount?: number;
  tax_percent?: number;
  tax_amount?: number;
  line_total?: number;
  product?: { id?: number; name?: string; code?: string; sale_price?: number };
};

export type AggregateSalePayment = {
  id: number;
  amount: number;
  total_payments?: number | null;
  remaining_payable?: number | null;
  date?: string | null;
  status?: string | null;
  type?: string | null;
  number?: string | null;
  notes?: string | null;
  bank_account_id?: number | null;
  idempotency_key?: string | null;
  method?: { id: number; name?: string | null } | null;
};

export type AggregateSale = {
  id: number;
  sale_key: string;
  source?: string;
  source_label?: string;
  company_id: number;
  reference?: string | null;
  document_number?: string | null;
  document_type?: string | null;
  order_number?: string | null;
  order_reference?: string | null;
  external_id?: string | null;
  state: string;
  payment_status?: "unpaid" | "partial" | "paid";
  total?: number;
  subtotal?: number;
  tax?: number;
  discount?: number;
  rest_payable?: number;
  collected?: number | null;
  date?: string;
  date_order?: string;
  date_due?: string;
  confirmed_at?: string | null;
  customer?: {
    id?: number;
    name?: string;
    surname?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  items?: AggregateSaleItem[];
  payments?: AggregateSalePayment[];
  items_count?: number | null;
  payments_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AggregateSaleMutationResult = {
  created: boolean;
  idempotent: boolean;
  hint?: string;
  sale: AggregateSale;
};

export type AggregateBankAccount = {
  id: number;
  company_id?: number;
  name: string;
  reference?: string | null;
  account_number?: string | null;
  iban?: string | null;
  is_cash?: boolean;
};

export type AggregatePaymentMethod = {
  id: number;
  company_id?: number;
  name: string;
  icon?: string | null;
  is_cash?: boolean;
  status?: boolean;
  default_bank_account_id?: number | null;
  bank_accounts?: AggregateBankAccount[];
};

export type AggregatePaymentMethodsData = {
  payment_methods: AggregatePaymentMethod[];
  bank_accounts: AggregateBankAccount[];
};

export type AggregateSalePublishInput = {
  document_type?: "receipt" | "advance" | "global" | "generic" | "FT" | "FA" | "FG" | "GF";
  idempotency_key?: string;
  date_due?: string;
  notes?: string;
};

export type AggregateSalePublishResult = {
  published: boolean;
  idempotent: boolean;
  document_number?: string | null;
  sale: AggregateSale;
};

export type AggregateSalePaymentInput = {
  idempotency_key: string;
  external_payment_id?: string;
  amount: number;
  payment_method_id: number;
  bank_account_id?: number | null;
  type?: "payment" | "advance";
  date?: string;
  reference?: string;
  notes?: string;
};

export type AggregateSalePaymentResult = {
  created: boolean;
  idempotent: boolean;
  payment: AggregateSalePayment;
  sale: AggregateSale;
};

export type AggregateMeData = {
  key: AggregateKeyMeta & {
    rate_limit_per_minute?: number;
    expires_at?: string | null;
    last_used_at?: string | null;
  };
  owner_company_id?: number | null;
  company_ids?: number[];
  companies?: Array<{
    id: number;
    name: string;
    reference?: string | number | null;
    email?: string | null;
    nif?: string | null;
    platform_status?: string | null;
    is_owner?: boolean;
    role?: string;
  }>;
};

export type AggregateSalesQuery = {
  company_id?: number | string;
  source?: string;
  state?: string;
  page?: number;
  per_page?: number;
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
