import type { PrismaClient, StayChargeKind } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getStay } from "./stay-service";
import { verifyCentralProductPrice } from "@/modules/sigesc-integration/products/products-service";

/**
 * Operational stay account — not a fiscal ledger.
 * Mapped products always use verified central prices.
 */
export async function addStayCharge(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input: {
    kind?: StayChargeKind;
    description: string;
    quantity?: number;
    mappingLocalCode?: string;
    /** Only allowed for non-mapped ADJUSTMENT/FEE without catalog — still audited */
    manualUnitPrice?: number;
  },
) {
  const stay = await getStay(prisma, ctx, stayId);
  if (!["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status)) {
    throw new Error("Charges can only be added to an active stay");
  }

  let unitPrice: number;
  let catalogMappingId: string | null = null;
  let centralProductId: string | null = null;
  const qty = input.quantity ?? 1;
  if (qty <= 0) throw new Error("Quantity must be positive");

  if (input.mappingLocalCode) {
    const mapping = await prisma.productCatalogMapping.findUnique({
      where: {
        institutionId_localCode: {
          institutionId: ctx.institutionId,
          localCode: input.mappingLocalCode,
        },
      },
    });
    if (!mapping || !mapping.active) {
      throw new Error("Catalog mapping not found or inactive");
    }
    const verified = await verifyCentralProductPrice(prisma, ctx, mapping.centralProductId);
    unitPrice = verified.salePrice;
    catalogMappingId = mapping.id;
    centralProductId = mapping.centralProductId;
    await prisma.productCatalogMapping.update({
      where: { id: mapping.id },
      data: {
        centralSalePrice: verified.salePrice,
        centralTaxPercent: verified.taxPercent,
        centralPriceVerifiedAt: verified.verifiedAt,
        lastSyncedAt: verified.verifiedAt,
      },
    });
  } else if (
    (input.kind === "ADJUSTMENT" || input.kind === "FEE" || input.kind === "DISCOUNT") &&
    input.manualUnitPrice != null
  ) {
    unitPrice = Number(input.manualUnitPrice);
    if (Number.isNaN(unitPrice)) throw new Error("Invalid manual unit price");
  } else {
    throw new Error(
      "Provide mappingLocalCode for catalog charges, or manualUnitPrice for FEE/DISCOUNT/ADJUSTMENT only",
    );
  }

  const line = await prisma.stayAccountCharge.create({
    data: {
      stayId,
      institutionId: ctx.institutionId,
      kind: input.kind ?? (input.mappingLocalCode ? "EXTRA_SERVICE" : "FEE"),
      status: "CONFIRMED",
      description: input.description.trim(),
      quantity: qty,
      unitPrice,
      catalogMappingId,
      centralProductId,
      actorUserId: ctx.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "StayAccountCharge",
      entityId: line.id,
      metadata: {
        stayId,
        unitPrice,
        centralProductId,
        mappingLocalCode: input.mappingLocalCode,
      },
    },
  });

  return line;
}

export async function voidStayCharge(
  prisma: PrismaClient,
  ctx: TenantContext,
  chargeId: string,
  reason: string,
  expectedStayId?: string,
) {
  const charge = await prisma.stayAccountCharge.findUnique({ where: { id: chargeId } });
  if (
    !charge ||
    charge.institutionId !== ctx.institutionId ||
    (expectedStayId && charge.stayId !== expectedStayId)
  ) {
    throw new Error("Charge not found");
  }
  if (charge.status === "HANDED_OFF") {
    throw new Error("Cannot void a charge already handed off to Aggregate");
  }
  return prisma.stayAccountCharge.update({
    where: { id: chargeId },
    data: { status: "VOIDED", voidReason: reason.trim() || "voided" },
  });
}

export async function summarizeStayAccount(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
) {
  const stay = await getStay(prisma, ctx, stayId);
  const lines = stay.accountLines.filter((l) => l.status !== "VOIDED");
  const total = lines.reduce(
    (sum, l) => sum + Number(l.unitPrice) * Number(l.quantity),
    0,
  );
  return {
    stayId,
    currency: lines[0]?.currency ?? "AOA",
    lines,
    operationalTotal: total,
    note: "Operational summary only — official amounts require Aggregate Cotação/Proforma",
  };
}
