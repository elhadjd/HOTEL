import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { encryptAggregateKey } from "./crypto";
import { MOCK_VALID_MCA_KEY, resetAggregateClient } from "./index";
import { resetAllMockAggregateStores } from "./mock-adapter";
import { createGuest } from "@/modules/guests/guest-service";
import {
  convertCustomerToGuest,
  bulkConvertCustomersToGuests,
  MAX_CUSTOMER_TO_GUEST_BATCH,
} from "./guests/customer-to-guest-service";
import {
  unlinkGuestFromCentralCustomer,
  createCentralCustomer,
} from "./customers/customers-service";
import {
  upsertCatalogMapping,
  verifyCentralProductPrice,
} from "./products/products-service";
import { createInvoiceDraft, submitInvoice } from "./invoices/invoice-service";
import type { TenantContext } from "@/modules/tenancy/tenant";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Phase 5 pricing + guest lifecycle", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let ctx: TenantContext;
  let userId = "";

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    resetAggregateClient();
    resetAllMockAggregateStores();

    const institution = await prisma.institution.create({
      data: {
        name: "Phase5 Test Hotel",
        slug: `phase5-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "44",
      },
    });
    institutionId = institution.id;

    const user = await prisma.user.create({
      data: {
        email: `phase5-admin-${Date.now()}@test.local`,
        name: "Phase5 Admin",
        passwordHash: "x",
        active: true,
      },
    });
    userId = user.id;

    await prisma.aggregateConnection.create({
      data: {
        institutionId,
        host: "https://app.sisgesc.net",
        encryptedApiKey: encryptAggregateKey(MOCK_VALID_MCA_KEY),
        keyPrefix: "mca_mock",
        scopesJson: ["all"],
        status: "ACTIVE",
        ownerCompanyExternalId: "44",
      },
    });

    ctx = {
      userId,
      institutionId,
      membershipId: "test",
      roleCode: "hotel_admin",
      permissions: [
        "integrations.customers",
        "integrations.products",
        "integrations.invoices",
        "guests.write",
      ],
    };
  });

  beforeEach(() => {
    resetAggregateClient();
  });

  afterAll(async () => {
    if (institutionId) {
      await prisma.invoiceSubmissionAttempt.deleteMany({
        where: { invoice: { institutionId } },
      });
      await prisma.invoiceIntegration.deleteMany({ where: { institutionId } });
      await prisma.productCatalogMapping.deleteMany({ where: { institutionId } });
      await prisma.guestCustomerMapping.deleteMany({ where: { institutionId } });
      await prisma.guest.deleteMany({ where: { institutionId } });
      await prisma.auditLog.deleteMany({ where: { institutionId } });
      await prisma.aggregateConnection.deleteMany({ where: { institutionId } });
      await prisma.institution.delete({ where: { id: institutionId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("rejects guest creation without central customer", async () => {
    await expect(
      createGuest(prisma, ctx, {
        firstName: "X",
        lastName: "Y",
        centralCustomerId: "" as unknown as string,
      }),
    ).rejects.toThrow(/centralCustomerId is required/);
  });

  it("creates guest with existing central customer", async () => {
    const guest = await createGuest(prisma, ctx, {
      firstName: "Carlos",
      lastName: "Ops",
      centralCustomerId: 501,
    });
    expect(guest.customerMapping?.syncStatus).toBe("LINKED");
    expect(guest.customerMapping?.externalCustomerId).toBe("501");
  });

  it("rejects duplicate guest for same central customer", async () => {
    await expect(
      createGuest(prisma, ctx, {
        firstName: "Dup",
        lastName: "Guest",
        centralCustomerId: 501,
      }),
    ).rejects.toThrow(/already associated/);
  });

  it("allows central customer without guest (502 available)", async () => {
    const found = await prisma.guestCustomerMapping.findFirst({
      where: { institutionId, externalCustomerId: "502", syncStatus: "LINKED" },
    });
    expect(found).toBeNull();
  });

  it("converts customer to guest and is idempotent", async () => {
    const first = await convertCustomerToGuest(prisma, ctx, 502);
    expect(first.outcome).toBe("converted");
    expect(first.guestId).toBeTruthy();

    const second = await convertCustomerToGuest(prisma, ctx, 502);
    expect(second.outcome).toBe("already_associated");
    expect(second.guestId).toBe(first.guestId);
  });

  it("bulk convert handles mixed and empty/max limits", async () => {
    await expect(bulkConvertCustomersToGuests(prisma, ctx, [])).rejects.toThrow(/At least one/);

    const tooMany = Array.from({ length: MAX_CUSTOMER_TO_GUEST_BATCH + 1 }, (_, i) => 9000 + i);
    await expect(bulkConvertCustomersToGuests(prisma, ctx, tooMany)).rejects.toThrow(/maximum/);

    const created = await createCentralCustomer(prisma, ctx, {
      name: "Bulk",
      surname: "One",
      email: `bulk-one-${Date.now()}@exemplo.com`,
    });
    const created2 = await createCentralCustomer(prisma, ctx, {
      name: "Bulk",
      surname: "Two",
      email: `bulk-two-${Date.now()}@exemplo.com`,
    });

    const batch = await bulkConvertCustomersToGuests(prisma, ctx, [
      created.customer.id,
      created.customer.id,
      created2.customer.id,
      999999,
    ]);
    expect(batch.summary.converted).toBeGreaterThanOrEqual(2);
    expect(batch.summary.duplicate_in_batch).toBe(1);
    expect(batch.summary.invalid_customer).toBe(1);
  });

  it("forbids unlink leaving guest without customer", async () => {
    await expect(unlinkGuestFromCentralCustomer(prisma, ctx, "any")).rejects.toThrow(
      /not allowed/,
    );
  });

  it("verifies central price and uses it on invoice (ignores browser unitPrice)", async () => {
    const verified = await verifyCentralProductPrice(prisma, ctx, 902);
    expect(verified.salePrice).toBe(3500);

    await upsertCatalogMapping(prisma, ctx, {
      localCode: "breakfast-p5",
      localLabel: "Pequeno-almoço",
      centralProductId: "902",
      kind: "SERVICE",
    });

    const guest = await prisma.guest.findFirstOrThrow({
      where: {
        institutionId,
        customerMapping: { externalCustomerId: "501", syncStatus: "LINKED" },
      },
    });

    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId: guest.id,
      state: "Cotação",
      lines: [
        {
          mappingLocalCode: "breakfast-p5",
          quantity: 2,
          unitPrice: 1, // must be ignored
        },
      ],
    });
    const lines = draft.linesJson as { lines: Array<{ unit_price: number }> };
    expect(lines.lines[0]?.unit_price).toBe(3500);

    const created = await submitInvoice(prisma, ctx, draft.id);
    expect(created.status).toBe("CREATED");
    expect(Number(created.centralTotal)).toBe(7000);
  });

  it("rejects foreign company customer conversion", async () => {
    // Mock only has company 44 — inventing id that fails getCustomer
    const result = await convertCustomerToGuest(prisma, ctx, 404404);
    expect(result.outcome).toBe("invalid_customer");
  });

  it("blocks invoice when central product price cannot be verified", async () => {
    await upsertCatalogMapping(prisma, ctx, {
      localCode: "missing-product",
      localLabel: "Missing",
      centralProductId: "404404",
      kind: "PRODUCT",
    }).catch(() => undefined);

    // Force a mapping without live Aggregate product by writing DB directly
    await prisma.productCatalogMapping.upsert({
      where: {
        institutionId_localCode: { institutionId, localCode: "ghost-svc" },
      },
      create: {
        institutionId,
        localCode: "ghost-svc",
        localLabel: "Ghost",
        kind: "SERVICE",
        centralProductId: "404404",
        centralCompanyId: "44",
        legacyHistoricalPrice: 99,
        active: true,
      },
      update: {
        centralProductId: "404404",
        legacyHistoricalPrice: 99,
        active: true,
      },
    });

    const guest = await prisma.guest.findFirstOrThrow({
      where: {
        institutionId,
        customerMapping: { externalCustomerId: "501", syncStatus: "LINKED" },
      },
    });

    await expect(
      createInvoiceDraft(prisma, ctx, {
        guestId: guest.id,
        state: "Cotação",
        lines: [{ mappingLocalCode: "ghost-svc", quantity: 1, unitPrice: 99 }],
      }),
    ).rejects.toThrow(/Cannot verify central price|not found|404/i);
  });

  it("preserves historical guests needing resolution without deleting them", async () => {
    const orphan = await prisma.guest.create({
      data: {
        institutionId,
        firstName: "Histórico",
        lastName: "Órfão",
        customerMapping: {
          create: {
            institutionId,
            syncStatus: "NEEDS_RESOLUTION",
          },
        },
      },
      include: { customerMapping: true },
    });
    expect(orphan.customerMapping?.syncStatus).toBe("NEEDS_RESOLUTION");
    expect(orphan.id).toBeTruthy();
  });
});
