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
import { resolveValidatedAggregateHost } from "./host-allowlist";

/**
 * Port for SIGESC Aggregate multi-company API (documented endpoints only).
 * @see docs/architecture/SIGESC_INTEGRATION.md
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

  fetchMe?(apiKey: string): Promise<unknown>;
}

export type AggregateMode = "mock" | "http";

export function resolveAggregateMode(): AggregateMode {
  const mode = (
    process.env.SIGESC_AGGREGATE_MODE ??
    process.env.SIGESC_INTEGRATION_MODE ??
    "mock"
  ).toLowerCase();
  return mode === "http" ? "http" : "mock";
}

export function resolveAggregateHost(): string {
  return resolveValidatedAggregateHost();
}
