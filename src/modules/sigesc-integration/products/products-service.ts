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
