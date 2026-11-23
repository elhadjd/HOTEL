import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { encryptAggregateKey } from "./crypto";
import { MOCK_VALID_MCA_KEY, resetAggregateClient } from "./index";
import { resetAllMockAggregateStores } from "./mock-adapter";
import { linkGuestToCentralCustomer } from "./customers/customers-service";
import { upsertCatalogMapping } from "./products/products-service";
import {
  addItemsToInvoice,
  createInvoiceDraft,
  listInvoiceIntegrations,
  normalizeLineDiscount,
  submitInvoice,
} from "./invoices/invoice-service";
import type { TenantContext } from "@/modules/tenancy/tenant";

describe("Phase 7.1 discount validation", () => {
  it("accepts zero and in-range discounts with 2-decimal precision", () => {
    expect(normalizeLineDiscount(undefined, 100, 2)).toBe(0);
    expect(normalizeLineDiscount(10.556, 100, 2)).toBe(10.56);
    expect(normalizeLineDiscount(10.5, 100, 2)).toBe(10.5);
    expect(normalizeLineDiscount(200, 100, 2)).toBe(200);
  });

  it("rejects negative discounts", () => {
    expect(() => normalizeLineDiscount(-1, 100, 1)).toThrow(/negative/i);
  });

  it("rejects discounts greater than line amount", () => {
    expect(() => normalizeLineDiscount(201, 100, 2)).toThrow(/exceeds/i);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Phase 7.1 invoice list pagination + append idempotency", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let otherInstitutionId = "";
  let guestId = "";
  let ctx: TenantContext;
  let otherCtx: TenantContext;
  const mappingCode = `p71-svc-${Date.now()}`;

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    resetAggregateClient();
    resetAllMockAggregateStores();

    const institution = await prisma.institution.create({
      data: {
        name: "Phase71 Hotel",
        slug: `phase71-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "44",
      },
    });
    institutionId = institution.id;

    const other = await prisma.institution.create({
      data: {
        name: "Phase71 Other",
        slug: `phase71-other-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "99",
      },
    });
    otherInstitutionId = other.id;

    const user = await prisma.user.create({
      data: {
        email: `phase71-admin-${Date.now()}@test.local`,
        name: "Phase71 Admin",
        passwordHash: "x",
        active: true,
      },
    });

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

    const guest = await prisma.guest.create({
      data: {
        institutionId,
        firstName: "Nzinga",
        lastName: "Mbande",
        email: `nzinga-${Date.now()}@test.local`,
        customerMapping: {
          create: { institutionId, syncStatus: "NEEDS_RESOLUTION" },
        },
      },
    });
    guestId = guest.id;

    ctx = {
      userId: user.id,
      institutionId,
      membershipId: "test-membership-p71",
      roleCode: "hotel_admin",
      permissions: [
        "integrations.customers",
        "integrations.products",
        "integrations.invoices",
      ],
    };
    otherCtx = {
      userId: user.id,
      institutionId: otherInstitutionId,
      membershipId: "none",
      roleCode: "hotel_admin",
      permissions: ["integrations.invoices"],
    };

    await linkGuestToCentralCustomer(prisma, ctx, guestId, 501);
    await upsertCatalogMapping(prisma, ctx, {
      localCode: mappingCode,
      localLabel: "Serviço Phase71",
      centralProductId: "902",
      kind: "SERVICE",
    });
  });

  beforeEach(() => {
    resetAggregateClient();
    // Do not wipe mock Aggregate fixtures — guest mappings persist in DB.
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
    }
    if (otherInstitutionId) {
      await prisma.institution.delete({ where: { id: otherInstitutionId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: { contains: "phase71-admin-" } } });
    await prisma.$disconnect();
  });

  it("filters before pagination and finds a document on a later page by search", async () => {
    const marker = `P71-PAGE-${Date.now()}`;
    const createdIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const draft = await createInvoiceDraft(prisma, ctx, {
        guestId,
        state: "Cotação",
        notes: i === 24 ? `needle-${marker}` : `bulk-${i}`,
        lines: [{ mappingLocalCode: mappingCode, quantity: 1 }],
      });
      createdIds.push(draft.id);
    }

    const page0 = await listInvoiceIntegrations(prisma, ctx, { take: 10, skip: 0 });
    expect(page0.rows).toHaveLength(10);
    expect(page0.total).toBeGreaterThanOrEqual(25);

    const found = await listInvoiceIntegrations(prisma, ctx, {
      q: `needle-${marker}`,
      take: 10,
      skip: 0,
    });
    expect(found.total).toBe(1);
    expect(found.rows[0]?.notes).toContain(marker);
    expect(found.rows[0]?.id).toBe(createdIds[24]);

    const byGuestName = await listInvoiceIntegrations(prisma, ctx, {
      q: "Nzinga",
      take: 5,
      skip: 0,
    });
    expect(byGuestName.total).toBeGreaterThanOrEqual(1);

    const foreign = await listInvoiceIntegrations(prisma, otherCtx, {
      q: `needle-${marker}`,
      take: 10,
      skip: 0,
    });
    expect(foreign.total).toBe(0);
    expect(foreign.rows).toHaveLength(0);
  });

  it("reuses ADD_ITEMS_OK for the same idempotency key and does not double-append", async () => {
    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId,
      state: "Cotação",
      lines: [{ mappingLocalCode: mappingCode, quantity: 1 }],
    });
    const created = await submitInvoice(prisma, ctx, draft.id);
    expect(created.status).toBe("CREATED");
    expect(created.saleKey).toBeTruthy();

    const key = `idem-append-${Date.now()}`;
    await addItemsToInvoice(
      prisma,
      ctx,
      draft.id,
      [{ mappingLocalCode: mappingCode, quantity: 2, discount: 1 }],
      { idempotencyKey: key },
    );

    const afterFirst = await prisma.invoiceSubmissionAttempt.findMany({
      where: { invoiceId: draft.id },
      orderBy: { attemptNo: "asc" },
    });
    expect(afterFirst.filter((a) => a.outcome === "ADD_ITEMS_OK")).toHaveLength(1);

    await addItemsToInvoice(
      prisma,
      ctx,
      draft.id,
      [{ mappingLocalCode: mappingCode, quantity: 2, discount: 1 }],
      { idempotencyKey: key },
    );

    const afterSecond = await prisma.invoiceSubmissionAttempt.findMany({
      where: { invoiceId: draft.id },
    });
    expect(afterSecond.filter((a) => a.outcome === "ADD_ITEMS_OK")).toHaveLength(1);
    expect(afterSecond.filter((a) => a.outcome === "ADD_ITEMS_PENDING")).toHaveLength(1);
  });

  it("rejects append when invoice is not in CREATED state", async () => {
    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId,
      state: "Cotação",
      lines: [{ mappingLocalCode: mappingCode, quantity: 1 }],
    });
    await expect(
      addItemsToInvoice(prisma, ctx, draft.id, [
        { mappingLocalCode: mappingCode, quantity: 1 },
      ]),
    ).rejects.toThrow(/created Cotação\/Proforma/i);
  });
});
