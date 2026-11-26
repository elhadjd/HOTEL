import type { CatalogKind, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getAggregateClient } from "../client";
import {
  assertAggregateScope,
  assertCompanyMatchesConnection,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import type { AggregateProduct, AggregateProductsQuery, AggregateProductWriteInput } from "../types";

/** Cached central price older than this is not presented as verified-current. */
export const CENTRAL_PRICE_FRESHNESS_MS = 5 * 60 * 1000;

export type VerifiedCentralPrice = {
  productId: number;
  companyId: number;
  name: string;
  salePrice: number;
  taxPercent: number | null;
  currencyHint: "AOA";
  verifiedAt: Date;
  product: AggregateProduct;
};

export function isCentralPriceFresh(verifiedAt: Date | null | undefined, now = new Date()): boolean {
  if (!verifiedAt) return false;
  return now.getTime() - verifiedAt.getTime() <= CENTRAL_PRICE_FRESHNESS_MS;
}

export async function searchCentralProducts(
  prisma: PrismaClient,
  ctx: TenantContext,
  query: Omit<AggregateProductsQuery, "company_id"> = {},
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient(resolved.connection.host);
  return client.listProducts(resolved.apiKey, {
    ...query,
    company_id: resolved.companyNumericId,
  });
}

export async function getCentralProduct(
  prisma: PrismaClient,
  ctx: TenantContext,
  productId: number | string,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient(resolved.connection.host);
  const product = await client.getProduct(resolved.apiKey, productId, {
    company_id: resolved.companyNumericId,
  });
  assertCompanyMatchesConnection(resolved, product.company_id);
  return product;
}

/**
 * Fetch official central sale price. Blocks when Aggregate cannot verify.
 * Never falls back to legacyHistoricalPrice.
 */
export async function verifyCentralProductPrice(
  prisma: PrismaClient,
  ctx: TenantContext,
  productId: number | string,
): Promise<VerifiedCentralPrice> {
  const product = await getCentralProduct(prisma, ctx, productId);
  const salePrice = product.sale_price ?? product.price;
  if (salePrice === null || salePrice === undefined || Number.isNaN(Number(salePrice))) {
    throw new Error(
      `Central product #${productId} has no verifiable sale_price from SIGESC Aggregate`,
    );
  }
  const verifiedAt = new Date();
  return {
    productId: product.id,
    companyId: product.company_id,
    name: product.name,
    salePrice: Number(salePrice),
    taxPercent: product.tax_percent != null ? Number(product.tax_percent) : null,
    currencyHint: "AOA",
    verifiedAt,
    product,
  };
}

export async function createCentralProduct(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: Omit<AggregateProductWriteInput, "company_id">,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient(resolved.connection.host);
  const result = await client.createProduct(resolved.apiKey, {
    ...input,
    company_id: resolved.companyNumericId,
  });
  assertCompanyMatchesConnection(resolved, result.product.company_id);

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "CentralProduct",
      entityId: String(result.product.id),
      metadata: { name: result.product.name, kind: input.kind ?? null },
    },
  });

  return result;
}

export async function updateCentralProduct(
  prisma: PrismaClient,
  ctx: TenantContext,
  productId: number | string,
  input: Omit<AggregateProductWriteInput, "company_id">,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  await getCentralProduct(prisma, ctx, productId);
  const client = getAggregateClient(resolved.connection.host);
  const result = await client.updateProduct(resolved.apiKey, productId, input);
  assertCompanyMatchesConnection(resolved, result.product.company_id);

  const now = new Date();
  const nextSalePrice = result.product.sale_price ?? result.product.price;
  const mappingUpdate = await prisma.productCatalogMapping.updateMany({
    where: {
      institutionId: ctx.institutionId,
      centralProductId: String(result.product.id),
      centralCompanyId: resolved.companyId,
    },
    data: {
      centralName: result.product.name,
      ...(nextSalePrice !== null && nextSalePrice !== undefined
        ? { centralSalePrice: Number(nextSalePrice) }
        : {}),
      centralTaxPercent:
        result.product.tax_percent != null ? Number(result.product.tax_percent) : null,
      centralPriceVerifiedAt: now,
      lastSyncedAt: now,
      lastError: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "CentralProduct",
      entityId: String(productId),
      metadata: {
        fields: Object.keys(input),
        salePrice: nextSalePrice ?? null,
        taxPercent: result.product.tax_percent ?? null,
        updatedMappingsCount: mappingUpdate.count,
      },
    },
  });

  return {
    ...result,
    updatedMappingsCount: mappingUpdate.count,
    verifiedAt: now.toISOString(),
  };
}

export async function listCatalogMappings(
  prisma: PrismaClient,
  ctx: TenantContext,
  query?: { q?: string; take?: number; activeOnly?: boolean },
) {
  const q = query?.q?.trim();
  const take =
    query?.take != null ? Math.min(Math.max(query.take, 1), 200) : undefined;
  return prisma.productCatalogMapping.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(query?.activeOnly ? { active: true } : {}),
      ...(q
        ? {
            OR: [
              { localCode: { contains: q } },
              { localLabel: { contains: q } },
              { centralName: { contains: q } },
              { centralProductId: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { localCode: "asc" },
    ...(take != null ? { take } : {}),
  });
}

export async function upsertCatalogMapping(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    localCode: string;
    localLabel: string;
    kind?: CatalogKind;
    centralProductId: string;
    active?: boolean;
  },
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const verified = await verifyCentralProductPrice(prisma, ctx, input.centralProductId);

  const mapping = await prisma.productCatalogMapping.upsert({
    where: {
      institutionId_localCode: {
        institutionId: ctx.institutionId,
        localCode: input.localCode.trim(),
      },
    },
    create: {
      institutionId: ctx.institutionId,
      connectionId: resolved.connection.id,
      localCode: input.localCode.trim(),
      localLabel: input.localLabel.trim(),
      kind: input.kind ?? "SERVICE",
      centralProductId: String(verified.productId),
      centralCompanyId: resolved.companyId,
      centralName: verified.name,
      centralSalePrice: verified.salePrice,
      centralTaxPercent: verified.taxPercent,
      centralPriceVerifiedAt: verified.verifiedAt,
      active: input.active ?? true,
      lastSyncedAt: verified.verifiedAt,
      lastError: null,
    },
    update: {
      connectionId: resolved.connection.id,
      localLabel: input.localLabel.trim(),
      kind: input.kind ?? undefined,
      centralProductId: String(verified.productId),
      centralCompanyId: resolved.companyId,
      centralName: verified.name,
      centralSalePrice: verified.salePrice,
      centralTaxPercent: verified.taxPercent,
      centralPriceVerifiedAt: verified.verifiedAt,
      active: input.active ?? true,
      lastSyncedAt: verified.verifiedAt,
      lastError: null,
      // Never write legacyHistoricalPrice from API — leave historical residue untouched
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "ProductCatalogMapping",
      entityId: mapping.id,
      metadata: {
        localCode: mapping.localCode,
        centralProductId: mapping.centralProductId,
        centralSalePrice: verified.salePrice,
      },
    },
  });

  return mapping;
}

/** Refresh cached central price from Aggregate for a mapping. */
export async function refreshCatalogMappingPrice(
  prisma: PrismaClient,
  ctx: TenantContext,
  mappingId: string,
) {
  const mapping = await prisma.productCatalogMapping.findUnique({ where: { id: mappingId } });
  if (!mapping || mapping.institutionId !== ctx.institutionId) {
    throw new Error("Catalog mapping not found");
  }
  const verified = await verifyCentralProductPrice(prisma, ctx, mapping.centralProductId);
  return prisma.productCatalogMapping.update({
    where: { id: mappingId },
    data: {
      centralName: verified.name,
      centralSalePrice: verified.salePrice,
      centralTaxPercent: verified.taxPercent,
      centralPriceVerifiedAt: verified.verifiedAt,
      lastSyncedAt: verified.verifiedAt,
      lastError: null,
    },
  });
}

export async function deleteCatalogMapping(
  prisma: PrismaClient,
  ctx: TenantContext,
  mappingId: string,
) {
  const mapping = await prisma.productCatalogMapping.findUnique({ where: { id: mappingId } });
  if (!mapping || mapping.institutionId !== ctx.institutionId) {
    throw new Error("Catalog mapping not found");
  }
  await prisma.productCatalogMapping.delete({ where: { id: mappingId } });
  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "DELETE",
      entityType: "ProductCatalogMapping",
      entityId: mappingId,
      metadata: { localCode: mapping.localCode },
    },
  });
}

function buildImportLocalCode(product: AggregateProduct, usedCodes: Set<string>): string {
  const rawCode = product.code?.trim();
  if (rawCode) {
    const clean = rawCode
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 56);
    if (clean && !usedCodes.has(clean.toLowerCase())) {
      return clean;
    }
  }
  const fallback = `central_${product.id}`;
  if (!usedCodes.has(fallback.toLowerCase())) {
    return fallback;
  }
  return `central_${product.id}_${Date.now().toString(36).slice(-4)}`;
}

function resolveCatalogKind(product: AggregateProduct): CatalogKind {
  const raw =
    (product.kind ??
      (typeof product.product_type === "string"
        ? product.product_type
        : product.product_type?.name) ??
      "")
      .toLowerCase()
      .trim();
  if (raw.includes("serv")) return "SERVICE";
  return "PRODUCT";
}

export type BulkImportCentralProductsInput =
  | {
      mode: "single";
      productId?: number | string;
      product?: AggregateProduct;
    }
  | {
      mode: "selected";
      productIds: Array<number | string>;
    }
  | {
      mode: "all";
      kind?: "all" | "product" | "service";
      search?: string;
    };

export type BulkImportCentralProductsResult = {
  mode: "single" | "selected" | "all";
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  totalProcessed: number;
  errors: Array<{ productId: string; reason: string }>;
};

/**
 * Imports one, several selected, or all central products/services into the hotel's
 * ProductCatalogMapping table so they become immediately selectable in stays & invoicing.
 * Idempotent: existing mappings for the same centralProductId are refreshed in place
 * without overwriting custom localCode values (e.g. "accommodation").
 */
export async function importCentralProductsToCatalog(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: BulkImportCentralProductsInput,
): Promise<BulkImportCentralProductsResult> {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient(resolved.connection.host);

  const productsToImport: AggregateProduct[] = [];
  const errors: Array<{ productId: string; reason: string }> = [];

  if (input.mode === "single") {
    if (input.product) {
      assertCompanyMatchesConnection(resolved, input.product.company_id);
      productsToImport.push(input.product);
    } else if (input.productId != null) {
      const prod = await getCentralProduct(prisma, ctx, input.productId);
      productsToImport.push(prod);
    } else {
      throw new Error("productId is required for single import");
    }
  } else if (input.mode === "selected") {
    const uniqueIds = [...new Set(input.productIds.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error("Select at least one product to import");
    }
    for (const pid of uniqueIds) {
      try {
        const prod = await getCentralProduct(prisma, ctx, pid);
        productsToImport.push(prod);
      } catch (err) {
        errors.push({
          productId: pid,
          reason: err instanceof Error ? err.message : "Failed to load central product",
        });
      }
    }
  } else {
    // mode === "all": paginate through the entire central catalog for this company
    const MAX_PAGES = 50;
    let currentPage = 1;
    let lastPage = 1;
    do {
      const res = await client.listProducts(resolved.apiKey, {
        company_id: resolved.companyNumericId,
        kind: input.kind && input.kind !== "all" ? input.kind : undefined,
        search: input.search?.trim() || undefined,
        page: currentPage,
        per_page: 100,
      });
      for (const prod of res.data ?? []) {
        if (String(prod.company_id) === resolved.companyId) {
          productsToImport.push(prod);
        }
      }
      lastPage = Math.min(res.meta?.pagination?.last_page ?? currentPage, MAX_PAGES);
      currentPage += 1;
    } while (currentPage <= lastPage);
  }

  const existingMappings = await prisma.productCatalogMapping.findMany({
    where: { institutionId: ctx.institutionId },
    select: {
      id: true,
      localCode: true,
      centralProductId: true,
      centralCompanyId: true,
    },
  });

  const byCentralId = new Map<string, (typeof existingMappings)[number]>();
  const usedCodes = new Set<string>();
  for (const m of existingMappings) {
    usedCodes.add(m.localCode.toLowerCase());
    if (!byCentralId.has(m.centralProductId)) {
      byCentralId.set(m.centralProductId, m);
    }
  }

  const now = new Date();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const prod of productsToImport) {
    const centralId = String(prod.id);
    const salePrice = prod.sale_price ?? prod.price;
    if (salePrice === null || salePrice === undefined || Number.isNaN(Number(salePrice))) {
      skipped += 1;
      continue;
    }

    const existing = byCentralId.get(centralId);
    const taxPercent = prod.tax_percent != null ? Number(prod.tax_percent) : null;
    const kind = resolveCatalogKind(prod);

    try {
      if (existing) {
        await prisma.productCatalogMapping.update({
          where: { id: existing.id },
          data: {
            connectionId: resolved.connection.id,
            centralCompanyId: resolved.companyId,
            centralName: prod.name,
            centralSalePrice: Number(salePrice),
            centralTaxPercent: taxPercent,
            centralPriceVerifiedAt: now,
            active: true,
            lastSyncedAt: now,
            lastError: null,
          },
        });
        updated += 1;
      } else {
        const localCode = buildImportLocalCode(prod, usedCodes);
        usedCodes.add(localCode.toLowerCase());
        const created = await prisma.productCatalogMapping.create({
          data: {
            institutionId: ctx.institutionId,
            connectionId: resolved.connection.id,
            localCode,
            localLabel: prod.name.slice(0, 120),
            kind,
            centralProductId: centralId,
            centralCompanyId: resolved.companyId,
            centralName: prod.name,
            centralSalePrice: Number(salePrice),
            centralTaxPercent: taxPercent,
            centralPriceVerifiedAt: now,
            active: true,
            lastSyncedAt: now,
            lastError: null,
          },
        });
        byCentralId.set(centralId, {
          id: created.id,
          localCode: created.localCode,
          centralProductId: created.centralProductId,
          centralCompanyId: created.centralCompanyId,
        });
        imported += 1;
      }
    } catch (err) {
      errors.push({
        productId: centralId,
        reason: err instanceof Error ? err.message : "Failed to save catalog mapping",
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "ProductCatalogMapping",
      entityId: resolved.connection.id,
      metadata: {
        operation: "bulk_import",
        mode: input.mode,
        imported,
        updated,
        skipped,
        failed: errors.length,
        totalProcessed: productsToImport.length,
      },
    },
  });

  return {
    mode: input.mode,
    imported,
    updated,
    skipped,
    failed: errors.length,
    totalProcessed: productsToImport.length,
    errors,
  };
}
