import type { AggregatePort } from "./port";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { redactSecrets, safeErrorMessage } from "./sanitize";
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

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * HTTP client for documented Aggregate endpoints only.
 * Not validated against live SIGESC unless SIGESC_AGGREGATE_MODE=http.
 */
export class HttpAggregateAdapter implements AggregatePort {
  private readonly host: string;
  private readonly timeoutMs: number;

  constructor(host?: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.host = resolveValidatedAggregateHost(host);
    this.timeoutMs = timeoutMs;
  }

  private basePath(): string {
    return `${this.host}/api/v1/aggregate/multi-company`;
  }

  private async requestJson<T>(
    apiKey: string,
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    options?: {
      searchParams?: Record<string, string | number | undefined>;
      body?: unknown;
      okStatuses?: number[];
    },
  ): Promise<T> {
    const url = new URL(`${this.basePath()}${path}`);
    if (options?.searchParams) {
      for (const [k, v] of Object.entries(options.searchParams)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };
    if (options?.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
      }
      throw new AggregateApiError(
        `SIGESC Aggregate unavailable: ${safeErrorMessage(err, "network error")}`,
        503,
        503,
      );
    }

    let body: AggregateEnvelope<T> | null = null;
    try {
      body = (await res.json()) as AggregateEnvelope<T>;
    } catch {
      throw new AggregateApiError("Invalid JSON response from SIGESC Aggregate", 502, 502);
    }

    const okStatuses = options?.okStatuses ?? [200, 201];
    if (!okStatuses.includes(res.status) || !body?.success) {
      const raw = body?.error?.message ?? `Aggregate API error (${res.status})`;
      throw new AggregateApiError(redactSecrets(raw), res.status, body?.error?.code ?? res.status);
    }
    if (body.data === undefined) {
      throw new AggregateApiError("Invalid Aggregate envelope (missing data)", 502, 502);
    }
    return body.data;
  }

  async fetchOnboarding(
    apiKey: string,
    query?: AggregateOnboardingQuery,
  ): Promise<AggregateOnboardingData> {
    return this.requestJson<AggregateOnboardingData>(apiKey, "GET", "/onboarding", {
      searchParams: {
        company_id: query?.company_id,
        company_ids: query?.company_ids,
      },
    });
  }

  async fetchUsers(
    apiKey: string,
    query?: AggregateUsersQuery,
  ): Promise<AggregateEnvelope<AggregateUser[]>> {
    const url = new URL(`${this.basePath()}/users`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
      }
      throw new AggregateApiError(
        `SIGESC Aggregate unavailable: ${safeErrorMessage(err, "network error")}`,
        503,
        503,
      );
    }
    let body: AggregateEnvelope<AggregateUser[]> | null = null;
    try {
      body = (await res.json()) as AggregateEnvelope<AggregateUser[]>;
    } catch {
      throw new AggregateApiError("Invalid JSON response from SIGESC Aggregate", 502, 502);
    }
    if (!res.ok || !body?.success) {
      const raw = body?.error?.message ?? `Aggregate API error (${res.status})`;
      throw new AggregateApiError(redactSecrets(raw), res.status, body?.error?.code ?? res.status);
    }
    return body;
  }

  async listCustomers(
    apiKey: string,
    query?: AggregateCustomersQuery,
  ): Promise<AggregateEnvelope<AggregateCustomer[]>> {
    const url = new URL(`${this.basePath()}/customers`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
      }
      throw new AggregateApiError(
        `SIGESC Aggregate unavailable: ${safeErrorMessage(err, "network error")}`,
        503,
        503,
      );
    }
    let body: AggregateEnvelope<AggregateCustomer[]> | null = null;
    try {
      body = (await res.json()) as AggregateEnvelope<AggregateCustomer[]>;
    } catch {
      throw new AggregateApiError("Invalid JSON response from SIGESC Aggregate", 502, 502);
    }
    if (!res.ok || !body?.success) {
      const raw = body?.error?.message ?? `Aggregate API error (${res.status})`;
      throw new AggregateApiError(redactSecrets(raw), res.status, body?.error?.code ?? res.status);
    }
    return body;
  }

  async getCustomer(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateCustomer> {
    return this.requestJson<AggregateCustomer>(apiKey, "GET", `/customers/${id}`, {
      searchParams: { company_id: query?.company_id },
    });
  }

  async createCustomer(
    apiKey: string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    return this.requestJson<AggregateCustomerMutationResult>(apiKey, "POST", "/customers", {
      body,
      okStatuses: [200, 201],
    });
  }

  async updateCustomer(
    apiKey: string,
    id: number | string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    return this.requestJson<AggregateCustomerMutationResult>(apiKey, "PATCH", `/customers/${id}`, {
      body,
      okStatuses: [200],
    });
  }
}
