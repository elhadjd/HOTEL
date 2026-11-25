import type {
  AggregateCustomer,
  AggregateCustomerMutationResult,
  AggregateCustomersQuery,
  AggregateCustomerWriteInput,
  AggregateEnvelope,
  AggregateOnboardingData,
  AggregateOnboardingQuery,
  AggregateProduct,
  AggregateProductMutationResult,
  AggregateProductsQuery,
  AggregateProductWriteInput,
  AggregateSale,
  AggregateSaleCreateInput,
  AggregateSaleItemInput,
  AggregateSaleMutationResult,
  AggregateSalesQuery,
  AggregateUser,
  AggregateUsersQuery,
} from "./types";
import { resolveValidatedAggregateHost } from "./host-allowlist";

/**
 * Port for SIGESC Aggregate multi-company API (documented endpoints only).
 * @see docs/architecture/SIGESC_INTEGRATION.md
 * @see docs/contracts/API_AGGREGATE_*.md
 */
export interface AggregatePort {
  fetchOnboarding(
    apiKey: string,
    query?: AggregateOnboardingQuery,
  ): Promise<AggregateOnboardingData>;

  fetchUsers(
    apiKey: string,
    query?: AggregateUsersQuery,
  ): Promise<AggregateEnvelope<AggregateUser[]>>;

  listCustomers(
    apiKey: string,
    query?: AggregateCustomersQuery,
  ): Promise<AggregateEnvelope<AggregateCustomer[]>>;

  getCustomer(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateCustomer>;

  createCustomer(
    apiKey: string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult>;

  updateCustomer(
    apiKey: string,
    id: number | string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult>;

  listProducts(
    apiKey: string,
    query?: AggregateProductsQuery,
  ): Promise<AggregateEnvelope<AggregateProduct[]>>;

  getProduct(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateProduct>;

  createProduct(
    apiKey: string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult>;

  updateProduct(
    apiKey: string,
    id: number | string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult>;

  /**
   * POST /sales — Cotação/Proforma only.
   * Returns httpStatus so callers can distinguish 201 vs 200 idempotent.
   */
  createSale(
    apiKey: string,
    body: AggregateSaleCreateInput,
  ): Promise<{ httpStatus: number; result: AggregateSaleMutationResult }>;

  getSale(apiKey: string, saleKey: string): Promise<AggregateSale>;

  listSales(
    apiKey: string,
    query?: AggregateSalesQuery,
  ): Promise<AggregateEnvelope<AggregateSale[]>>;

  addSaleItems(
    apiKey: string,
    saleKey: string,
    items: AggregateSaleItemInput[],
  ): Promise<AggregateSale>;

  fetchMe?(apiKey: string): Promise<unknown>;
}

export type AggregateMode = "mock" | "http";

export function resolveAggregateMode(): AggregateMode {
  const raw = (
    process.env.SIGESC_AGGREGATE_MODE ??
    process.env.SIGESC_INTEGRATION_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

  if (process.env.NODE_ENV === "production") {
    if (raw === "mock") {
      throw new Error(
        'SIGESC_AGGREGATE_MODE="mock" is forbidden in production. Configure SIGESC_AGGREGATE_MODE="http" to send documents to SIGESC.',
      );
    }
    return "http";
  }

  return raw === "http" ? "http" : "mock";
}

export function isAggregateMockMode(): boolean {
  try {
    return resolveAggregateMode() === "mock";
  } catch {
    return false;
  }
}

export function resolveAggregateHost(): string {
  return resolveValidatedAggregateHost();
}
