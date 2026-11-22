import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { encryptAggregateKey } from "./crypto";
import { MOCK_VALID_MCA_KEY, resetAggregateClient } from "./index";
import { resetAllMockAggregateStores } from "./mock-adapter";
import {
  createCentralCustomerFromGuest,
  linkGuestToCentralCustomer,
  searchCentralCustomers,
  unlinkGuestFromCentralCustomer,
} from "./customers/customers-service";
import {
  createCentralProduct,
  searchCentralProducts,
  upsertCatalogMapping,
} from "./products/products-service";
import {
  createInvoiceDraft,
  reconcileInvoice,
  submitInvoice,
} from "./invoices/invoice-service";
import type { TenantContext } from "@/modules/tenancy/tenant";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Phase 4 commerce integration", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let connectionId = "";
  let guestId = "";
  let otherInstitutionId = "";
  let ctx: TenantContext;
  let otherCtx: TenantContext;

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    resetAggregateClient();
    resetAllMockAggregateStores();

    const institution = await prisma.institution.create({
      data: {
        name: "Phase4 Test Hotel",
        slug: `phase4-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "44",
      },
    });
    institutionId = institution.id;

    const user = await prisma.user.create({
      data: {
        email: `phase4-admin-${Date.now()}@test.local`,
        name: "Phase4 Admin",
        passwordHash: "x",
        active: true,
      },
    });

    const connection = await prisma.aggregateConnection.create({
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
    connectionId = connection.id;

    const guest = await prisma.guest.create({
      data: {
        institutionId,
        firstName: "Maria",
        lastName: "Teste",
        email: "maria.phase4@exemplo.com",
        phone: "+244900000001",
        customerMapping: {
          create: {
            institutionId,
            syncStatus: "UNLINKED",
          },
        },
      },
    });
    guestId = guest.id;

    ctx = {
      userId: user.id,
      institutionId,
      membershipId: "test-membership",
      roleCode: "hotel_admin",
      permissions: [
        "integrations.customers",
        "integrations.products",
        "integrations.invoices",
      ],
    };

    const other = await prisma.institution.create({
      data: {
        name: "Other Inst",
        slug: `phase4-other-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
      },
    });
    otherInstitutionId = other.id;
    otherCtx = {
      userId: user.id,
      institutionId: otherInstitutionId,
      membershipId: "none",
      roleCode: "hotel_admin",
      permissions: ["integrations.customers"],
    };
  });

  beforeEach(() => {
    resetAggregateClient();
    // Do not wipe customer/product fixtures mid-suite — guest mappings persist in DB.
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
      await prisma.user.deleteMany({ where: { email: { contains: "phase4-admin-" } } });
    }
    if (otherInstitutionId) {
      await prisma.institution.delete({ where: { id: otherInstitutionId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("searches central customers for connected company only", async () => {
    const list = await searchCentralCustomers(prisma, ctx, { search: "Carlos" });
    expect(list.data?.[0]?.company_id).toBe(44);
  });

  it("blocks Aggregate ops without connection (cross-tenant)", async () => {
    await expect(searchCentralCustomers(prisma, otherCtx, {})).rejects.toThrow(/No Aggregate/);
  });

  it("links guest to central customer and prevents duplicate mapping", async () => {
    const mapping = await linkGuestToCentralCustomer(prisma, ctx, guestId, 501);
    expect(mapping.syncStatus).toBe("LINKED");
    expect(mapping.externalCustomerId).toBe("501");
    expect(mapping.connectionId).toBe(connectionId);

    const guest2 = await prisma.guest.create({
      data: {
        institutionId,
        firstName: "Outro",
        lastName: "Hospede",
        customerMapping: { create: { institutionId, syncStatus: "UNLINKED" } },
      },
    });
    await expect(linkGuestToCentralCustomer(prisma, ctx, guest2.id, 501)).rejects.toThrow(
      /already linked/,
    );

    await unlinkGuestFromCentralCustomer(prisma, ctx, guestId);
    const after = await prisma.guestCustomerMapping.findUniqueOrThrow({ where: { guestId } });
    expect(after.syncStatus).toBe("UNLINKED");
    expect(after.externalCustomerId).toBeNull();
  });

  it("creates central customer from guest after search confirmation path", async () => {
    // Unique email so no candidates
    await prisma.guest.update({
      where: { id: guestId },
      data: { email: `unique-${Date.now()}@exemplo.com`, phone: `+2449${Date.now().toString().slice(-8)}` },
    });
    const result = await createCentralCustomerFromGuest(prisma, ctx, guestId, {
      forceCreate: true,
    });
    expect(result.needsConfirmation).toBe(false);
    if (!result.needsConfirmation) {
      expect(result.mapping.syncStatus).toBe("LINKED");
      expect(result.customer.id).toBeTruthy();
    }
  });

  it("maps local service to central product without overwriting prices", async () => {
    const products = await searchCentralProducts(prisma, ctx, { kind: "service" });
    const product = products.data![0]!;
    const mapping = await upsertCatalogMapping(prisma, ctx, {
      localCode: "accommodation",
      localLabel: "Alojamento",
      localOperationalPrice: 50000,
      kind: "SERVICE",
      centralProductId: String(product.id),
    });
    expect(Number(mapping.localOperationalPrice)).toBe(50000);
    expect(mapping.centralProductId).toBe(String(product.id));
    expect(Number(mapping.centralSalePrice)).toBe(Number(product.sale_price));
    expect(Number(mapping.localOperationalPrice)).not.toBe(Number(mapping.centralSalePrice));
  });

  it("creates Cotação with idempotency and rejects Publicado at draft layer", async () => {
    await linkGuestToCentralCustomer(prisma, ctx, guestId, 501);
    await upsertCatalogMapping(prisma, ctx, {
      localCode: "breakfast",
      localLabel: "Pequeno-almoço",
      centralProductId: "902",
      kind: "SERVICE",
    });

    await expect(
      createInvoiceDraft(prisma, ctx, {
        guestId,
        state: "Publicado",
        lines: [{ mappingLocalCode: "breakfast", quantity: 1 }],
      }),
    ).rejects.toThrow(/Cotação or Proforma/);

    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId,
      state: "Cotação",
      lines: [{ mappingLocalCode: "breakfast", quantity: 2 }],
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.externalId).toMatch(/^HOT-INV-/);

    const created = await submitInvoice(prisma, ctx, draft.id);
    expect(created.status).toBe("CREATED");
    expect(created.saleKey).toMatch(/^billing-/);
    expect(Number(created.centralTotal)).toBeGreaterThan(0);

    // Concurrent / second submit of CREATED returns same record
    const again = await submitInvoice(prisma, ctx, draft.id);
    expect(again.id).toBe(created.id);
    expect(again.saleKey).toBe(created.saleKey);
  });

  it("marks reconciliation required on ambiguous timeout and recovers safely", async () => {
    await linkGuestToCentralCustomer(prisma, ctx, guestId, 501);
    await upsertCatalogMapping(prisma, ctx, {
      localCode: "parking",
      localLabel: "Estacionamento",
      centralProductId: "902",
      kind: "SERVICE",
    });

    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId,
      state: "Proforma",
      lines: [{ mappingLocalCode: "parking", quantity: 1 }],
    });

    // Force ambiguous external id suffix recognized by mock
    await prisma.invoiceIntegration.update({
      where: { id: draft.id },
      data: { externalId: `${draft.externalId}-AMBIGUOUS-TIMEOUT` },
    });

    const timedOut = await submitInvoice(prisma, ctx, draft.id);
    expect(timedOut.status).toBe("RECONCILIATION_REQUIRED");
    expect(timedOut.saleKey).toBeNull();

    const recovered = await reconcileInvoice(prisma, ctx, draft.id);
    expect(recovered.status).toBe("CREATED");
    expect(recovered.saleKey).toBeTruthy();
    expect(recovered.idempotentHit).toBe(true);
  });

  it("creates a central product via service", async () => {
    const created = await createCentralProduct(prisma, ctx, {
      name: "Spa 30min",
      kind: "service",
      sale_price: 15000,
    });
    expect(created.product.company_id).toBe(44);
    expect(created.product.tax_percent).toBe(0);
  });
});
