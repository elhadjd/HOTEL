import type { AggregatePort } from "./port";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { redactSecrets, safeErrorMessage } from "./sanitize";
import { createRequestId, getRequestId, logger } from "@/server/logger";
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
import { AggregateApiError } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

function assertNumericSegment(raw: number | string, label: string): string {
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    throw new AggregateApiError(`Invalid ${label} identifier`, 400, 400);
  }
  return encodeURIComponent(s);
}

function assertSaleKeySegment(raw: string): string {
  const s = String(raw).trim();
  if (!/^(?:[a-zA-Z0-9_-]+-)?\d+$/.test(s) || s.includes("..")) {
    throw new AggregateApiError("Invalid sale_key identifier", 400, 400);
  }
  return encodeURIComponent(s);
}

function extractAggregateErrorMessage(
  body: (AggregateEnvelope<unknown> & { errors?: Record<string, string[] | string> }) | null,
  status: number,
): string {
  const base = body?.error?.message ?? `Aggregate API error (${status})`;
  if (body?.errors && typeof body.errors === "object") {
    const details = Object.entries(body.errors)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : String(msgs)}`)
      .filter(Boolean)
      .join("; ");
    if (details) return redactSecrets(`${base} (${details})`);
  }
  return redactSecrets(base);
}

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
      returnStatus?: boolean;
    },
  ): Promise<T | { httpStatus: number; data: T }> {
    const url = new URL(`${this.basePath()}${path}`);
    if (options?.searchParams) {
      for (const [k, v] of Object.entries(options.searchParams)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const requestId = getRequestId() ?? createRequestId();
    const startedAt = Date.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "X-Request-Id": requestId,
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
      const latencyMs = Date.now() - startedAt;
      logger.error("sigesc.http.network_error", {
        requestId,
        method,
        path,
        latencyMs,
        errorName: name || "unknown",
      });
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
      }
      throw new AggregateApiError(
        `SIGESC Aggregate unavailable: ${safeErrorMessage(err, "network error")}`,
        503,
        503,
      );
    }

    let body: (AggregateEnvelope<T> & { errors?: Record<string, string[] | string> }) | null = null;
    try {
      body = (await res.json()) as AggregateEnvelope<T> & {
        errors?: Record<string, string[] | string>;
      };
    } catch {
      logger.error("sigesc.http.invalid_json", {
        requestId,
        method,
        path,
        status: res.status,
        latencyMs: Date.now() - startedAt,
      });
      throw new AggregateApiError("Invalid JSON response from SIGESC Aggregate", 502, 502);
    }

    const latencyMs = Date.now() - startedAt;
    const okStatuses = options?.okStatuses ?? [200, 201];
    if (!okStatuses.includes(res.status) || !body?.success) {
      logger.warn("sigesc.http.error_response", {
        requestId,
        method,
        path,
        status: res.status,
        latencyMs,
      });
      throw new AggregateApiError(
        extractAggregateErrorMessage(body, res.status),
        res.status,
        body?.error?.code ?? res.status,
      );
    }
    if (body.data === undefined) {
      throw new AggregateApiError("Invalid Aggregate envelope (missing data)", 502, 502);
    }
    logger.info("sigesc.http.completed", {
      requestId,
      method,
      path,
      status: res.status,
      latencyMs,
    });
    if (options?.returnStatus) {
      return { httpStatus: res.status, data: body.data };
    }
    return body.data;
  }

  private async requestEnvelope<T>(
    apiKey: string,
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<AggregateEnvelope<T>> {
    const url = new URL(`${this.basePath()}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const requestId = getRequestId() ?? createRequestId();
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "X-Request-Id": requestId,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      logger.error("sigesc.http.network_error", {
        requestId,
        method: "GET",
        path,
        latencyMs: Date.now() - startedAt,
        errorName: name || "unknown",
      });
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AggregateApiError("SIGESC Aggregate request timed out", 504, 504);
      }
      throw new AggregateApiError(
        `SIGESC Aggregate unavailable: ${safeErrorMessage(err, "network error")}`,
        503,
        503,
      );
    }
    let body: (AggregateEnvelope<T> & { errors?: Record<string, string[] | string> }) | null = null;
    try {
      body = (await res.json()) as AggregateEnvelope<T> & {
        errors?: Record<string, string[] | string>;
      };
    } catch {
      throw new AggregateApiError("Invalid JSON response from SIGESC Aggregate", 502, 502);
    }
    const latencyMs = Date.now() - startedAt;
    if (!res.ok || !body?.success) {
      logger.warn("sigesc.http.error_response", {
        requestId,
        method: "GET",
        path,
        status: res.status,
        latencyMs,
      });
      throw new AggregateApiError(
        extractAggregateErrorMessage(body, res.status),
        res.status,
        body?.error?.code ?? res.status,
      );
    }
    if (body.data === undefined) {
      throw new AggregateApiError("Invalid Aggregate envelope (missing data)", 502, 502);
    }
    logger.info("sigesc.http.completed", {
      requestId,
      method: "GET",
      path,
      status: res.status,
      latencyMs,
    });
    return body;
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
    }) as Promise<AggregateOnboardingData>;
  }

  async fetchUsers(
    apiKey: string,
    query?: AggregateUsersQuery,
  ): Promise<AggregateEnvelope<AggregateUser[]>> {
    return this.requestEnvelope<AggregateUser[]>(apiKey, "/users", query as Record<string, string | number | undefined>);
  }

  async listCustomers(
    apiKey: string,
    query?: AggregateCustomersQuery,
  ): Promise<AggregateEnvelope<AggregateCustomer[]>> {
    return this.requestEnvelope<AggregateCustomer[]>(
      apiKey,
      "/customers",
      query as Record<string, string | number | undefined>,
    );
  }

  async getCustomer(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateCustomer> {
    const safeId = assertNumericSegment(id, "customer");
    return this.requestJson<AggregateCustomer>(apiKey, "GET", `/customers/${safeId}`, {
      searchParams: { company_id: query?.company_id },
    }) as Promise<AggregateCustomer>;
  }

  async createCustomer(
    apiKey: string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    return this.requestJson<AggregateCustomerMutationResult>(apiKey, "POST", "/customers", {
      body,
      okStatuses: [200, 201],
    }) as Promise<AggregateCustomerMutationResult>;
  }

  async updateCustomer(
    apiKey: string,
    id: number | string,
    body: AggregateCustomerWriteInput,
  ): Promise<AggregateCustomerMutationResult> {
    const safeId = assertNumericSegment(id, "customer");
    return this.requestJson<AggregateCustomerMutationResult>(apiKey, "PATCH", `/customers/${safeId}`, {
      body,
      okStatuses: [200],
    }) as Promise<AggregateCustomerMutationResult>;
  }

  async listProducts(
    apiKey: string,
    query?: AggregateProductsQuery,
  ): Promise<AggregateEnvelope<AggregateProduct[]>> {
    return this.requestEnvelope<AggregateProduct[]>(
      apiKey,
      "/products",
      query as Record<string, string | number | undefined>,
    );
  }

  async getProduct(
    apiKey: string,
    id: number | string,
    query?: { company_id?: number | string },
  ): Promise<AggregateProduct> {
    const safeId = assertNumericSegment(id, "product");
    return this.requestJson<AggregateProduct>(apiKey, "GET", `/products/${safeId}`, {
      searchParams: { company_id: query?.company_id },
    }) as Promise<AggregateProduct>;
  }

  async createProduct(
    apiKey: string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult> {
    return this.requestJson<AggregateProductMutationResult>(apiKey, "POST", "/products", {
      body,
      okStatuses: [200, 201],
    }) as Promise<AggregateProductMutationResult>;
  }

  async updateProduct(
    apiKey: string,
    id: number | string,
    body: AggregateProductWriteInput,
  ): Promise<AggregateProductMutationResult> {
    const safeId = assertNumericSegment(id, "product");
    return this.requestJson<AggregateProductMutationResult>(apiKey, "PATCH", `/products/${safeId}`, {
      body,
      okStatuses: [200],
    }) as Promise<AggregateProductMutationResult>;
  }

  async createSale(
    apiKey: string,
    body: AggregateSaleCreateInput,
  ): Promise<{ httpStatus: number; result: AggregateSaleMutationResult }> {
    const wrapped = (await this.requestJson<AggregateSaleMutationResult>(apiKey, "POST", "/sales", {
      body,
      okStatuses: [200, 201],
      returnStatus: true,
    })) as { httpStatus: number; data: AggregateSaleMutationResult };
    if (!wrapped.data?.sale?.sale_key) {
      throw new AggregateApiError(
        "Invalid Aggregate response from POST /sales (missing sale.sale_key)",
        502,
        502,
      );
    }
    return { httpStatus: wrapped.httpStatus, result: wrapped.data };
  }

  async getSale(apiKey: string, saleKey: string): Promise<AggregateSale> {
    const safeKey = assertSaleKeySegment(saleKey);
    const raw = (await this.requestJson<AggregateSale | { sale: AggregateSale }>(
      apiKey,
      "GET",
      `/sales/${safeKey}`,
    )) as AggregateSale | { sale: AggregateSale };
    const sale = "sale" in raw && raw.sale ? raw.sale : (raw as AggregateSale);
    if (!sale?.sale_key) {
      throw new AggregateApiError("Invalid Aggregate response from GET /sales/{sale_key}", 502, 502);
    }
    return sale;
  }

  async listSales(
    apiKey: string,
    query?: AggregateSalesQuery,
  ): Promise<AggregateEnvelope<AggregateSale[]>> {
    return this.requestEnvelope<AggregateSale[]>(
      apiKey,
      "/sales",
      query as Record<string, string | number | undefined>,
    );
  }

  async addSaleItems(
    apiKey: string,
    saleKey: string,
    items: AggregateSaleItemInput[],
  ): Promise<AggregateSale> {
    const safeKey = assertSaleKeySegment(saleKey);
    const raw = (await this.requestJson<AggregateSale | { sale: AggregateSale }>(
      apiKey,
      "POST",
      `/sales/${safeKey}/items`,
      {
        body: { items },
        okStatuses: [200, 201],
      },
    )) as AggregateSale | { sale: AggregateSale };
    const sale = "sale" in raw && raw.sale ? raw.sale : (raw as AggregateSale);
    if (!sale?.sale_key || !sale?.state) {
      throw new AggregateApiError(
        "Invalid Aggregate response from POST /sales/{sale_key}/items",
        502,
        502,
      );
    }
    return sale;
  }

  async fetchMe(apiKey: string): Promise<unknown> {
    return this.requestJson<unknown>(apiKey, "GET", "/me");
  }
}
