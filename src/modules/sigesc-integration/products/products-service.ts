import type { CatalogKind, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getAggregateClient } from "../client";
import {
  assertAggregateScope,
  assertCompanyMatchesConnection,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import type { AggregateProductsQuery, AggregateProductWriteInput } from "../types";

export async function searchCentralProducts(
  prisma: PrismaClient,
  ctx: TenantContext,
  query: Omit<AggregateProductsQuery, "company_id"> = {},
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient();
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
  const client = getAggregateClient();
  const product = await client.getProduct(resolved.apiKey, productId, {
    company_id: resolved.companyNumericId,
  });
  assertCompanyMatchesConnection(resolved, product.company_id);
  return product;
}

export async function createCentralProduct(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: Omit<AggregateProductWriteInput, "company_id">,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const client = getAggregateClient();
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
  const client = getAggregateClient();
  const result = await client.updateProduct(resolved.apiKey, productId, input);

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "CentralProduct",
      entityId: String(productId),
      metadata: { fields: Object.keys(input) },
    },
  });

  return result;
}

export async function listCatalogMappings(prisma: PrismaClient, ctx: TenantContext) {
  return prisma.productCatalogMapping.findMany({
    where: { institutionId: ctx.institutionId },
    orderBy: { localCode: "asc" },
  });
}

export async function upsertCatalogMapping(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    localCode: string;
    localLabel: string;
    localOperationalPrice?: number | null;
    kind?: CatalogKind;
    centralProductId: string;
    active?: boolean;
  },
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "products");
  const product = await getCentralProduct(prisma, ctx, input.centralProductId);

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
      localOperationalPrice: input.localOperationalPrice ?? null,
      kind: input.kind ?? "SERVICE",
      centralProductId: String(product.id),
      centralCompanyId: resolved.companyId,
      centralName: product.name,
      centralSalePrice: product.sale_price ?? null,
      centralTaxPercent: product.tax_percent ?? null,
      active: input.active ?? true,
      lastSyncedAt: new Date(),
      lastError: null,
    },
    update: {
      connectionId: resolved.connection.id,
      localLabel: input.localLabel.trim(),
      localOperationalPrice: input.localOperationalPrice ?? null,
      kind: input.kind ?? undefined,
      centralProductId: String(product.id),
      centralCompanyId: resolved.companyId,
      centralName: product.name,
      centralSalePrice: product.sale_price ?? null,
      centralTaxPercent: product.tax_percent ?? null,
      active: input.active ?? true,
      lastSyncedAt: new Date(),
      lastError: null,
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
      },
    },
  });

  return mapping;
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
