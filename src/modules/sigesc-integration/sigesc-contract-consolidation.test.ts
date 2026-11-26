import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { HttpAggregateAdapter } from "./http-adapter";
import {
  MOCK_VALID_MCA_KEY,
  MockAggregateAdapter,
  resetAllMockAggregateStores,
} from "./mock-adapter";
import { AggregateApiError } from "./types";
import { encryptAggregateKey } from "./crypto";
import { updateCentralProduct } from "./products/products-service";
import {
  extractInvoicePayments,
  publishInvoice,
  settleInvoicePayment,
} from "./invoices/invoice-service";
import type { TenantContext } from "@/modules/tenancy/tenant";

const TEST_CTX: TenantContext = {
  userId: "user-1",
  institutionId: "inst-1",
  membershipId: "mem-1",
  roleCode: "hotel_admin",
  permissions: [
    "integrations.read",
    "integrations.manage",
    "integrations.customers",
    "integrations.products",
    "integrations.invoices",
    "integrations.invoices.settle",
  ],
};

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": "req-test-123",
    },
  });
}

describe("SIGESC ↔ HOTEL cross-contract consolidation (HttpAggregateAdapter)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchMe sends Authorization + X-Request-Id and unwraps exact SIGESC /me payload", async () => {
    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        success: true,
        data: {
          key: {
            id: 7,
            name: "Hotel Production Key",
            prefix: "mca_livekey01",
            status: "active",
            scopes: ["onboarding", "users", "customers", "products", "sales", "payments"],
          },
          owner_company_id: 22,
          company_ids: [22],
          companies: [
            {
              id: 22,
              name: "Hotel Atlântico Lda",
              reference: 22,
              is_owner: true,
              role: "owner",
            },
          ],
        },
      }),
    );

    const me = await adapter.fetchMe("mca_livekey0123456789012345");
    expect(me.key.name).toBe("Hotel Production Key");
    expect(me.key.scopes).toContain("payments");
    expect(me.owner_company_id).toBe(22);
    expect(me.companies?.[0]?.name).toBe("Hotel Atlântico Lda");

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mca_livekey0123456789012345");
    expect(headers["X-Request-Id"]).toBeTruthy();
  });

  it("updateCustomer and updateProduct match exact SIGESC PATCH envelopes & error mapping", async () => {
    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeJsonResponse({
          success: true,
          data: {
            created: false,
            customer: {
              id: 120,
              company_id: 22,
              name: "Maria",
              surname: "Silva",
              full_name: "Maria Silva",
              email: "maria@hotel.ao",
              phone: "+244911111111",
              nif: "5000999888",
              address: "Av. Marginal 10",
              city: "Luanda",
              country_id: 1,
              status: true,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          success: true,
          data: {
            created: false,
            product: {
              id: 55,
              company_id: 22,
              name: "Suite Presidencial",
              kind: "service",
              sale_price: 85000,
              tax_percent: 14,
              is_sellable: true,
              status: "active",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse(
          {
            success: false,
            error: { message: "Duplicate NIF for this company.", code: 422 },
            errors: { nif: ["NIF already registered for this company."] },
          },
          422,
        ),
      );

    const custRes = await adapter.updateCustomer("mca_livekey0123456789012345", 120, {
      phone: "+244911111111",
      address: "Av. Marginal 10",
      city: "Luanda",
    });
    expect(custRes.created).toBe(false);
    expect(custRes.customer.address).toBe("Av. Marginal 10");
    expect(custRes.customer.country_id).toBe(1);

    const prodRes = await adapter.updateProduct("mca_livekey0123456789012345", 55, {
      sale_price: 85000,
      tax_percent: 14,
    });
    expect(prodRes.created).toBe(false);
    expect(prodRes.product.kind).toBe("service");
    expect(prodRes.product.sale_price).toBe(85000);

    await expect(
      adapter.updateCustomer("mca_livekey0123456789012345", 120, { nif: "5000999888" }),
    ).rejects.toThrow(/nif: NIF already registered/);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("handles listPaymentMethods, publishSale, recordSalePayment (201/200/409/422) and blocks path traversal", async () => {
    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeJsonResponse({
          success: true,
          data: {
            payment_methods: [
              {
                id: 10,
                company_id: 22,
                name: "Dinheiro",
                icon: "cash",
                is_cash: true,
                status: true,
                default_bank_account_id: 4,
                bank_accounts: [{ id: 4, name: "Caixa Principal", reference: "CASH-22" }],
              },
            ],
            bank_accounts: [
              {
                id: 4,
                company_id: 22,
                name: "Caixa Principal",
                reference: "CASH-22",
                is_cash: true,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          success: true,
          data: {
            published: true,
            idempotent: false,
            document_number: "FT SG2026/10",
            sale: {
              id: 300,
              sale_key: "billing-300",
              company_id: 22,
              document_number: "FT SG2026/10",
              document_type: "FT",
              state: "Publicado",
              payment_status: "unpaid",
              total: 50000,
              subtotal: 43859.65,
              tax: 6140.35,
              rest_payable: 50000,
              collected: 0,
              payments: [],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse(
          {
            success: true,
            data: {
              created: true,
              idempotent: false,
              payment: {
                id: 901,
                number: "RC SG2026/1",
                amount: 20000,
                remaining_payable: 30000,
                date: "2026-11-26",
                status: "Publicado",
                type: "payment",
                bank_account_id: 4,
                method: { id: 10, name: "Dinheiro" },
              },
              sale: {
                id: 300,
                sale_key: "billing-300",
                company_id: 22,
                document_number: "FT SG2026/10",
                state: "Publicado",
                payment_status: "partial",
                total: 50000,
                rest_payable: 30000,
                collected: 20000,
                payments: [
                  {
                    id: 901,
                    number: "RC SG2026/1",
                    amount: 20000,
                    remaining_payable: 30000,
                    date: "2026-11-26",
                    method: { id: 10, name: "Dinheiro" },
                  },
                ],
              },
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        makeJsonResponse(
          {
            success: false,
            error: { message: "Invoice is already paid.", code: 409 },
          },
          409,
        ),
      );

    // Path traversal blocked before fetch
    await expect(
      adapter.publishSale("mca_livekey0123456789012345", "../evil"),
    ).rejects.toThrow(AggregateApiError);
    await expect(
      adapter.recordSalePayment("mca_livekey0123456789012345", "billing-1/../../x", {
        idempotency_key: "k1",
        amount: 100,
        payment_method_id: 10,
      }),
    ).rejects.toThrow(AggregateApiError);
    expect(fetchSpy).not.toHaveBeenCalled();

    const pm = await adapter.listPaymentMethods("mca_livekey0123456789012345", { company_id: 22 });
    expect(pm.payment_methods).toHaveLength(1);
    expect(pm.payment_methods[0]?.default_bank_account_id).toBe(4);
    expect(pm.bank_accounts[0]?.name).toBe("Caixa Principal");

    const pub = await adapter.publishSale("mca_livekey0123456789012345", "billing-300", {
      document_type: "receipt",
      idempotency_key: "pub-key-300",
    });
    expect(pub.httpStatus).toBe(200);
    expect(pub.result.published).toBe(true);
    expect(pub.result.document_number).toBe("FT SG2026/10");
    expect(pub.result.sale.state).toBe("Publicado");
    const pubHeaders = fetchSpy.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(pubHeaders["Idempotency-Key"]).toBe("pub-key-300");

    const pay = await adapter.recordSalePayment("mca_livekey0123456789012345", "billing-300", {
      idempotency_key: "pay-key-300-1",
      external_payment_id: "pay-key-300-1",
      amount: 20000,
      payment_method_id: 10,
      bank_account_id: 4,
    });
    expect(pay.httpStatus).toBe(201);
    expect(pay.result.created).toBe(true);
    expect(pay.result.payment.number).toBe("RC SG2026/1");
    expect(pay.result.sale.rest_payable).toBe(30000);
    expect(pay.result.sale.payment_status).toBe("partial");
    const payHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(payHeaders["Idempotency-Key"]).toBe("pay-key-300-1");

    await expect(
      adapter.recordSalePayment("mca_livekey0123456789012345", "billing-300", {
        idempotency_key: "pay-key-300-dup",
        amount: 100,
        payment_method_id: 10,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("MockAggregateAdapter full E2E publish & settlement lifecycle", () => {
  beforeEach(() => {
    resetAllMockAggregateStores();
  });

  it("executes /me, createSale, idempotent addSaleItems, publishSale, partial + full settlement, and rejects invalid payments", async () => {
    const adapter = new MockAggregateAdapter();

    const me = await adapter.fetchMe(MOCK_VALID_MCA_KEY);
    expect(me.key.scopes).toContain("all");
    expect(me.owner_company_id).toBe(44);

    const pm = await adapter.listPaymentMethods(MOCK_VALID_MCA_KEY, { company_id: 44 });
    expect(pm.payment_methods.length).toBeGreaterThanOrEqual(2);
    const cashMethod = pm.payment_methods[0]!;

    const created = await adapter.createSale(MOCK_VALID_MCA_KEY, {
      company_id: 44,
      external_id: "HOTEL-E2E-001",
      state: "Proforma",
      customer_id: 501,
      items: [{ product_id: 901, quantity: 2, unit_price: 45000 }],
    });
    expect(created.httpStatus).toBe(201);
    const saleKey = created.result.sale.sale_key;
    expect(created.result.sale.total).toBe(90000);

    // Idempotent addSaleItems
    const added1 = await adapter.addSaleItems(
      MOCK_VALID_MCA_KEY,
      saleKey,
      [{ product_id: 902, quantity: 2, unit_price: 3500 }],
      { idempotencyKey: "add-k1" },
    );
    const totalAfterAdd = added1.total!;
    expect(totalAfterAdd).toBe(97000);
    const addedReplay = await adapter.addSaleItems(
      MOCK_VALID_MCA_KEY,
      saleKey,
      [{ product_id: 902, quantity: 2, unit_price: 3500 }],
      { idempotencyKey: "add-k1" },
    );
    expect(addedReplay.total).toBe(totalAfterAdd);
    expect(addedReplay.items?.length).toBe(added1.items?.length);

    // Cannot pay before publish
    await expect(
      adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
        idempotency_key: "pay-too-early",
        amount: 1000,
        payment_method_id: cashMethod.id,
      }),
    ).rejects.toMatchObject({ status: 409 });

    // Publish -> FT + Publicado
    const pub1 = await adapter.publishSale(MOCK_VALID_MCA_KEY, saleKey, {
      document_type: "receipt",
      idempotency_key: "pub-e2e-1",
    });
    expect(pub1.result.published).toBe(true);
    expect(pub1.result.idempotent).toBe(false);
    expect(pub1.result.document_number).toMatch(/^FT /);
    expect(pub1.result.sale.state).toBe("Publicado");

    // Publish replay with same key -> idempotent
    const pubReplay = await adapter.publishSale(MOCK_VALID_MCA_KEY, saleKey, {
      document_type: "receipt",
      idempotency_key: "pub-e2e-1",
    });
    expect(pubReplay.result.published).toBe(false);
    expect(pubReplay.result.idempotent).toBe(true);

    // Partial payment
    const pay1 = await adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
      idempotency_key: "pay-e2e-1",
      amount: 40000,
      payment_method_id: cashMethod.id,
    });
    expect(pay1.httpStatus).toBe(201);
    expect(pay1.result.created).toBe(true);
    expect(pay1.result.sale.state).toBe("Publicado");
    expect(pay1.result.sale.payment_status).toBe("partial");
    expect(pay1.result.sale.rest_payable).toBeCloseTo(57000, 2);

    // Idempotent replay of partial payment does NOT double-charge
    const pay1Replay = await adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
      idempotency_key: "pay-e2e-1",
      amount: 40000,
      payment_method_id: cashMethod.id,
    });
    expect(pay1Replay.httpStatus).toBe(200);
    expect(pay1Replay.result.created).toBe(false);
    expect(pay1Replay.result.idempotent).toBe(true);
    expect(pay1Replay.result.sale.rest_payable).toBeCloseTo(57000, 2);

    // Over-payment rejected with 422
    await expect(
      adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
        idempotency_key: "pay-too-much",
        amount: totalAfterAdd,
        payment_method_id: cashMethod.id,
      }),
    ).rejects.toMatchObject({ status: 422 });

    // Final payment settles invoice to Pago
    const remaining = pay1.result.sale.rest_payable!;
    const pay2 = await adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
      idempotency_key: "pay-e2e-2",
      amount: remaining,
      payment_method_id: cashMethod.id,
    });
    expect(pay2.httpStatus).toBe(201);
    expect(pay2.result.sale.state).toBe("Pago");
    expect(pay2.result.sale.payment_status).toBe("paid");
    expect(pay2.result.sale.rest_payable).toBe(0);

    // Extra payment on paid invoice rejected with 409
    await expect(
      adapter.recordSalePayment(MOCK_VALID_MCA_KEY, saleKey, {
        idempotency_key: "pay-after-paid",
        amount: 100,
        payment_method_id: cashMethod.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("Service-layer price sync, publishInvoice, and settleInvoicePayment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY = "test-encryption-key-at-least-32-chars!!";
    resetAllMockAggregateStores();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function makeConnectionMock() {
    return {
      id: "conn-1",
      institutionId: "inst-1",
      host: "https://app.sisgesc.net",
      encryptedApiKey: encryptAggregateKey(MOCK_VALID_MCA_KEY),
      keyPrefix: "mca_mockvalid",
      keyName: "Mock",
      ownerCompanyExternalId: "44",
      scopesJson: ["all"],
      status: "ACTIVE",
    };
  }

  it("updateCentralProduct immediately updates local ProductCatalogMapping prices & tax", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const auditCreate = vi.fn().mockResolvedValue({});

    const fakePrisma = {
      aggregateConnection: {
        findUnique: vi.fn().mockResolvedValue(makeConnectionMock()),
      },
      productCatalogMapping: {
        updateMany,
      },
      auditLog: {
        create: auditCreate,
      },
    } as unknown as PrismaClient;

    const result = await updateCentralProduct(fakePrisma, TEST_CTX, 901, {
      sale_price: 52000,
      tax_percent: 14,
    });

    expect(result.product.sale_price).toBe(52000);
    expect(result.product.tax_percent).toBe(0);
    expect(result.updatedMappingsCount).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: "inst-1",
          centralCompanyId: "44",
          centralProductId: "901",
        },
        data: expect.objectContaining({
          centralSalePrice: 52000,
          centralTaxPercent: 0,
          centralPriceVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("publishInvoice and settleInvoicePayment handle full lifecycle, idempotency, and 504 reconciliation", async () => {
    const mockAdapter = new MockAggregateAdapter();
    const createdSale = await mockAdapter.createSale(MOCK_VALID_MCA_KEY, {
      company_id: 44,
      external_id: "HOTEL-SVC-001",
      state: "Proforma",
      customer_id: 501,
      items: [{ product_id: 901, quantity: 1, unit_price: 45000 }],
    });

    // In-memory state for InvoiceIntegration + attempts
    let invoiceRecord: Record<string, unknown> = {
      id: "inv-local-1",
      institutionId: "inst-1",
      connectionId: "conn-1",
      centralCompanyId: "44",
      externalId: "HOTEL-SVC-001",
      partner: "hotel",
      requestedState: "Proforma",
      status: "CREATED",
      saleKey: createdSale.result.sale.sale_key,
      centralSaleId: String(createdSale.result.sale.id),
      orderReference: null,
      centralState: "Proforma",
      centralTotal: createdSale.result.sale.total,
      centralSubtotal: createdSale.result.sale.subtotal,
      centralTax: createdSale.result.sale.tax,
      centralRestPayable: createdSale.result.sale.rest_payable,
      currency: "AOA",
      linesJson: { lines: [{ product_id: 901, quantity: 1, unit_price: 45000 }] },
      lastError: null,
    };
    const attempts: Array<Record<string, unknown>> = [];

    const fakePrisma = {
      aggregateConnection: {
        findUnique: vi.fn().mockResolvedValue(makeConnectionMock()),
      },
      invoiceIntegration: {
        findUnique: vi.fn().mockImplementation(async () => ({
          ...invoiceRecord,
          attempts: [...attempts],
        })),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          invoiceRecord = { ...invoiceRecord, ...data };
          return { ...invoiceRecord };
        }),
      },
      invoiceSubmissionAttempt: {
        count: vi.fn().mockImplementation(async () => attempts.length),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `att-${attempts.length + 1}`, createdAt: new Date(), ...data };
          attempts.push(rec);
          return rec;
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;

    // 1) Publish Proforma -> FT Publicado
    const pub = await publishInvoice(fakePrisma, TEST_CTX, "inv-local-1", {
      documentType: "receipt",
      idempotencyKey: "pub-svc-1",
    });
    expect(pub.reconciliationRequired).toBe(false);
    expect(pub.published).toBe(true);
    expect(pub.documentNumber).toMatch(/^FT /);
    expect(invoiceRecord.centralState).toBe("Publicado");

    // 2) Partial payment (45,000 - 15,000 = 30,000)
    const pay1 = await settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
      amount: 15000,
      paymentMethodId: 1,
      idempotencyKey: "pay-svc-1",
      notes: "Entrada",
    });
    expect(pay1.reconciliationRequired).toBe(false);
    expect(pay1.created).toBe(true);
    expect(invoiceRecord.centralState).toBe("Publicado");
    expect(Number(invoiceRecord.centralRestPayable)).toBeCloseTo(30000, 2);
    expect(extractInvoicePayments(invoiceRecord.linesJson)).toHaveLength(1);

    // 3) Ambiguous 504 timeout (remote applied 10,000 before timing out -> rest_payable = 20,000)
    const payTimeout = await settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
      amount: 10000,
      paymentMethodId: 1,
      idempotencyKey: "pay-svc-AMBIGUOUS-TIMEOUT",
    });
    expect(payTimeout.reconciliationRequired).toBe(true);
    expect(invoiceRecord.status).toBe("RECONCILIATION_REQUIRED");

    // 4) Retry with the SAME idempotency key reconciles cleanly without double-charging
    const payReconciled = await settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
      amount: 10000,
      paymentMethodId: 1,
      idempotencyKey: "pay-svc-AMBIGUOUS-TIMEOUT",
    });
    expect(payReconciled.reconciliationRequired).toBe(false);
    expect(payReconciled.idempotent).toBe(true);
    expect(Number(invoiceRecord.centralRestPayable)).toBeCloseTo(20000, 2);
    expect(extractInvoicePayments(invoiceRecord.linesJson)).toHaveLength(2);

    // 5) Over-payment (30,000 > 20,000) is blocked by live central balance check
    await expect(
      settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
        amount: 30000,
        paymentMethodId: 1,
        idempotencyKey: "pay-svc-overpay",
      }),
    ).rejects.toThrow(/exceeds central remaining balance/i);

    // 6) Final payment of exact remaining 20,000 settles invoice to Pago
    const payFinal = await settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
      amount: 20000,
      paymentMethodId: 1,
      idempotencyKey: "pay-svc-final",
    });
    expect(payFinal.reconciliationRequired).toBe(false);
    expect(payFinal.created).toBe(true);
    expect(invoiceRecord.centralState).toBe("Pago");
    expect(Number(invoiceRecord.centralRestPayable)).toBe(0);
    expect(extractInvoicePayments(invoiceRecord.linesJson)).toHaveLength(3);

    // 7) Further payment on fully paid invoice is blocked
    await expect(
      settleInvoicePayment(fakePrisma, TEST_CTX, "inv-local-1", {
        amount: 100,
        paymentMethodId: 1,
        idempotencyKey: "pay-svc-extra",
      }),
    ).rejects.toThrow(/already fully paid/i);
  });
});
