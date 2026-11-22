import { beforeEach, describe, expect, it } from "vitest";
import {
  MockAggregateAdapter,
  MOCK_NOSCOPE_MCA_KEY,
  MOCK_VALID_MCA_KEY,
  resetAllMockAggregateStores,
} from "./mock-adapter";
import { AggregateApiError } from "./types";

describe("Phase 4 Aggregate mock contract", () => {
  const client = new MockAggregateAdapter();

  beforeEach(() => {
    resetAllMockAggregateStores();
  });

  describe("customers", () => {
    it("searches and paginates", async () => {
      const list = await client.listCustomers(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        search: "Carlos",
        per_page: 10,
      });
      expect(list.success).toBe(true);
      expect(list.data?.length).toBe(1);
      expect(list.meta?.pagination?.total).toBe(1);
    });

    it("creates and rejects duplicate email/nif/code", async () => {
      const created = await client.createCustomer(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        name: "Novo",
        email: "novo@exemplo.com",
        nif: "5099999999",
        customer_code: "CLI-UNIQUE",
      });
      expect(created.created).toBe(true);

      await expect(
        client.createCustomer(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          name: "Dup",
          email: "novo@exemplo.com",
        }),
      ).rejects.toMatchObject({ status: 422 });

      await expect(
        client.createCustomer(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          name: "Dup",
          nif: "5099999999",
        }),
      ).rejects.toMatchObject({ status: 422 });

      await expect(
        client.createCustomer(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          name: "Dup",
          customer_code: "CLI-UNIQUE",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("rejects invalid company and missing scope", async () => {
      await expect(
        client.createCustomer(MOCK_VALID_MCA_KEY, { company_id: 99, name: "X" }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        client.listCustomers(MOCK_NOSCOPE_MCA_KEY, { company_id: 44 }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("updates partially and ignores company transfer", async () => {
      const updated = await client.updateCustomer(MOCK_VALID_MCA_KEY, 501, {
        company_id: 99,
        city: "Lubango",
      });
      expect(updated.customer.company_id).toBe(44);
      expect(updated.customer.city).toBe("Lubango");
    });
  });

  describe("products", () => {
    it("filters services vs products", async () => {
      const services = await client.listProducts(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        kind: "service",
      });
      expect(services.data?.every((p) => p.kind === "service")).toBe(true);

      const products = await client.listProducts(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        kind: "product",
      });
      expect(products.data?.every((p) => p.kind === "product")).toBe(true);
    });

    it("creates service with simplified tax 0%", async () => {
      const created = await client.createProduct(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        name: "Lavandaria",
        kind: "service",
        sale_price: 2000,
        tax_percent: 14,
      });
      expect(created.product.tax_percent).toBe(0);
      expect(created.product.kind).toBe("service");
    });

    it("updates product without transferring company", async () => {
      const updated = await client.updateProduct(MOCK_VALID_MCA_KEY, 901, {
        company_id: 99,
        name: "Diária Standard Plus",
      });
      expect(updated.product.company_id).toBe(44);
      expect(updated.product.name).toContain("Plus");
    });
  });

  describe("sales / invoices", () => {
    it("creates Cotação and returns central totals", async () => {
      const { httpStatus, result } = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: "HOT-INV-TEST-1",
        partner: "sigesc_hotelaria",
        state: "Cotação",
        customer_id: 501,
        items: [{ product_id: 901, quantity: 2, unit_price: 45000 }],
      });
      expect(httpStatus).toBe(201);
      expect(result.created).toBe(true);
      expect(result.idempotent).toBe(false);
      expect(result.sale.state).toBe("Cotação");
      expect(result.sale.sale_key).toMatch(/^billing-/);
      expect(result.sale.total).toBe(90000);
      expect(result.sale.order_reference).toBe("HOT-INV-TEST-1");
    });

    it("creates Proforma", async () => {
      const { result } = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: "HOT-INV-PROFORMA-1",
        state: "Proforma",
        items: [{ product_id: 902, quantity: 1 }],
      });
      expect(result.sale.state).toBe("Proforma");
    });

    it("rejects Publicado and Pago", async () => {
      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: "X1",
          state: "Publicado",
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(AggregateApiError);

      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: "X2",
          state: "Pago",
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("rejects empty items and invalid product/customer/company", async () => {
      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: "E1",
          items: [],
        }),
      ).rejects.toMatchObject({ status: 422 });

      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: "E2",
          items: [{ product_id: 99999, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 422 });

      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: "E3",
          customer_id: 99999,
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 422 });

      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 99,
          external_id: "E4",
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("is idempotent on repeated external_id without merging items", async () => {
      const first = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: "HOT-IDEM-1",
        items: [{ product_id: 901, quantity: 1 }],
      });
      const second = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: "HOT-IDEM-1",
        items: [
          { product_id: 901, quantity: 1 },
          { product_id: 902, quantity: 5 },
        ],
      });
      expect(second.httpStatus).toBe(200);
      expect(second.result.idempotent).toBe(true);
      expect(second.result.sale.id).toBe(first.result.sale.id);
      expect(second.result.sale.items?.length).toBe(first.result.sale.items?.length);
    });

    it("simulates ambiguous timeout then reconciles via same external_id", async () => {
      const externalId = "HOT-AMBIGUOUS-TIMEOUT";
      await expect(
        client.createSale(MOCK_VALID_MCA_KEY, {
          company_id: 44,
          external_id: externalId,
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 504 });

      const recovered = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: externalId,
        items: [{ product_id: 901, quantity: 1 }],
      });
      expect(recovered.httpStatus).toBe(200);
      expect(recovered.result.idempotent).toBe(true);
      expect(recovered.result.sale.sale_key).toBeTruthy();
    });

    it("retrieves sale and adds items only while editable", async () => {
      const created = await client.createSale(MOCK_VALID_MCA_KEY, {
        company_id: 44,
        external_id: "HOT-ADD-1",
        items: [{ product_id: 901, quantity: 1 }],
      });
      const sale = await client.getSale(MOCK_VALID_MCA_KEY, created.result.sale.sale_key);
      expect(sale.id).toBe(created.result.sale.id);

      const updated = await client.addSaleItems(MOCK_VALID_MCA_KEY, sale.sale_key, [
        { product_id: 902, quantity: 2 },
      ]);
      expect((updated.items?.length ?? 0) > (sale.items?.length ?? 0)).toBe(true);
    });

    it("denies sales without scope", async () => {
      await expect(
        client.createSale(MOCK_NOSCOPE_MCA_KEY, {
          company_id: 44,
          external_id: "NS1",
          items: [{ product_id: 901, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
