import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAggregateMode } from "./port";
import { HttpAggregateAdapter } from "./http-adapter";
import { AggregateApiError } from "./types";
import { extractInvoiceLines, summarizeInvoiceLines } from "./invoices/invoice-service";
import { resolveEmailMode } from "@/modules/email/mailer";
import { safeCallbackPath } from "@/shared/safe-redirect";
import { extractClientIp } from "@/modules/auth/rate-limit";

describe("P0 production fail-fast mode resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("defaults SIGESC Aggregate to http in production and forbids explicit mock", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.SIGESC_AGGREGATE_MODE;
    expect(resolveAggregateMode()).toBe("http");

    process.env.SIGESC_AGGREGATE_MODE = "mock";
    expect(() => resolveAggregateMode()).toThrow(/forbidden in production/i);

    process.env.SIGESC_AGGREGATE_MODE = "  http  ";
    expect(resolveAggregateMode()).toBe("http");
  });

  it("defaults EMAIL_MODE to smtp in production and forbids explicit mock", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.EMAIL_MODE;
    expect(resolveEmailMode()).toBe("smtp");

    process.env.EMAIL_MODE = "mock";
    expect(() => resolveEmailMode()).toThrow(/forbidden in production/i);
  });
});

describe("P0 HttpAggregateAdapter path-traversal & envelope hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects path-traversal customer, product, and sale_key identifiers before fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");

    await expect(adapter.getCustomer("mca_test", "../onboarding")).rejects.toThrow(
      AggregateApiError,
    );
    await expect(adapter.getProduct("mca_test", "12/../../users")).rejects.toThrow(
      AggregateApiError,
    );
    await expect(adapter.getSale("mca_test", "billing-1/../secret")).rejects.toThrow(
      AggregateApiError,
    );
    await expect(
      adapter.addSaleItems("mca_test", "../other", [{ product_id: 1, quantity: 1 }]),
    ).rejects.toThrow(AggregateApiError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves structured 422 validation errors and unwraps nested sale payloads", async () => {
    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { message: "Validation failed", code: 422 },
          errors: {
            "items.0.product_id": ["The selected product is invalid."],
          },
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      adapter.addSaleItems("mca_test", "billing-12", [{ product_id: 999, quantity: 1 }]),
    ).rejects.toThrow(/items\.0\.product_id: The selected product is invalid\./);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            sale: {
              id: 12,
              sale_key: "billing-12",
              state: "Proforma",
              total: 50000,
              items: [{ product_id: 10, description: "Noite Deluxe", quantity: 2, unit_price: 25000 }],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await adapter.addSaleItems("mca_test", "billing-12", [
      { product_id: 10, quantity: 1 },
    ]);
    expect(res.sale_key).toBe("billing-12");
    expect(res.state).toBe("Proforma");
    expect(res.items).toHaveLength(1);
  });
});

describe("P0 invoice line extraction & summary truth", () => {
  it("merges initial lines with appended lines when centralItems are not synced yet", () => {
    const linesJson = {
      lines: [
        {
          localCode: "NIGHT-STD",
          product_id: 101,
          description: "Noite Standard",
          quantity: 2,
          unit_price: 20000,
        },
      ],
      appended: [
        {
          at: "2026-11-25T10:00:00.000Z",
          lines: [
            {
              localCode: "WATER-500",
              product_id: 205,
              description: "Água Mineral",
              quantity: 3,
              unit_price: 1000,
            },
          ],
        },
      ],
    };

    const extracted = extractInvoiceLines(linesJson);
    expect(extracted).toHaveLength(2);
    const summary = summarizeInvoiceLines(linesJson);
    expect(summary.itemCount).toBe(2);
    expect(summary.totalQuantity).toBe(5);
    expect(summary.subtotal).toBe(43000);
  });

  it("prefers authoritative centralItems synced from SIGESC over local draft lines", () => {
    const linesJson = {
      lines: [{ description: "Old draft", quantity: 1, unit_price: 1000 }],
      centralItems: [
        { description: "Noite Confirmada", quantity: 2, unit_price: 25000 },
        { description: "Pequeno-almoço", quantity: 2, unit_price: 5000 },
      ],
    };

    const extracted = extractInvoiceLines(linesJson);
    expect(extracted).toHaveLength(2);
    expect(extracted[0]?.description).toBe("Noite Confirmada");
    expect(summarizeInvoiceLines(linesJson).subtotal).toBe(60000);
  });
});

describe("P0 open redirect & client IP hardening", () => {
  it("blocks backslash, protocol-relative, control-char, and auth-loop callback URLs", () => {
    expect(safeCallbackPath("/\\evil.com")).toBeNull();
    expect(safeCallbackPath("//evil.com/phish")).toBeNull();
    expect(safeCallbackPath("https://evil.com")).toBeNull();
    expect(safeCallbackPath("/en/login")).toBeNull();
    expect(safeCallbackPath("/pt/set-password?x=1")).toBeNull();
    expect(safeCallbackPath("/api/v1/hotels")).toBeNull();
    expect(safeCallbackPath("/dashboard\r\nSet-Cookie: a=b")).toBeNull();

    expect(safeCallbackPath("/pt/stays/123?tab=charges")).toBe("/pt/stays/123?tab=charges");
    expect(safeCallbackPath("/dashboard")).toBe("/dashboard");
  });

  it("prefers x-real-ip and uses rightmost x-forwarded-for hop", () => {
    const reqReal = new Request("https://hotel.sisgesc.net/api/v1/auth/forgot-password", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-real-ip": "198.51.100.20",
      },
    });
    expect(extractClientIp(reqReal)).toBe("198.51.100.20");

    const reqXff = new Request("https://hotel.sisgesc.net/api/v1/auth/forgot-password", {
      headers: {
        "x-forwarded-for": "spoofed-client, 203.0.113.9",
      },
    });
    expect(extractClientIp(reqXff)).toBe("203.0.113.9");
  });
});
