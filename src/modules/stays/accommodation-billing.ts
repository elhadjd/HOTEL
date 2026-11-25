import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { daysBetweenUtc, toDateOnlyUtc } from "@/modules/reservations/availability";
import { quoteAccommodation } from "@/modules/rates/rates-service";

type Db = PrismaClient | Prisma.TransactionClient;

export type AccommodationSyncPlan =
  | { action: "NOOP" }
  | {
      action: "UPSERT_UNBILLED";
      targetQuantity: number;
      unitPrice: number;
      existingChargeId: string | null;
      requiresCentralCreditNote: boolean;
    }
  | {
      action: "VOID_UNBILLED";
      chargeIdsToVoid: string[];
      requiresCentralCreditNote: boolean;
    };

/**
 * Pure planner for synchronizing a stay's `ACCOMMODATION` charges after check-in,
 * extension, early departure, or room transfer.
 *
 * Never mutates already `HANDED_OFF` (SIGESC-confirmed) lines: computes the exact
 * unbilled night delta instead.
 */
export function computeAccommodationSyncPlan(params: {
  totalNights: number;
  unitPrice: number | null;
  handedOffNights: number;
  unbilledChargeIds: string[];
}): AccommodationSyncPlan {
  const { totalNights, unitPrice, handedOffNights, unbilledChargeIds } = params;
  const remainingNights = totalNights - handedOffNights;

  if (remainingNights <= 0) {
    if (unbilledChargeIds.length === 0) return { action: "NOOP" };
    return {
      action: "VOID_UNBILLED",
      chargeIdsToVoid: unbilledChargeIds,
      requiresCentralCreditNote: remainingNights < 0,
    };
  }

  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return { action: "NOOP" };
  }

  return {
    action: "UPSERT_UNBILLED",
    targetQuantity: remainingNights,
    unitPrice: Number(unitPrice.toFixed(2)),
    existingChargeId: unbilledChargeIds[0] ?? null,
    requiresCentralCreditNote: false,
  };
}

/**
 * Synchronizes the stay's operational `ACCOMMODATION` charge(s) with:
 * 1. The room category's SIGESC `ProductCatalogMapping` (if linked), so Proforma/Cotação
 *    handoff at check-out automatically includes accommodation nights.
 * 2. Server-side operational rate resolution (`RatePlan` quote -> mapping central price ->
 *    reservation room nightly rate -> category defaultTariff).
 */
export async function syncStayAccommodationCharges(
  db: Db,
  ctx: TenantContext,
  stayId: string,
  reason: "CHECK_IN" | "EXTENSION" | "EARLY_DEPARTURE" | "TRANSFER",
) {
  const stay = await db.stay.findUnique({
    where: { id: stayId },
    include: {
      room: {
        include: {
          category: {
            include: {
              accommodationMapping: true,
            },
          },
        },
      },
      companions: { where: { removedAt: null } },
      reservation: {
        include: {
          rooms: true,
        },
      },
      accountLines: {
        where: {
          kind: "ACCOMMODATION",
          status: { not: "VOIDED" },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!stay || stay.institutionId !== ctx.institutionId) return null;

  const arrivalDay = toDateOnlyUtc(stay.actualArrival);
  const departureDay = toDateOnlyUtc(stay.expectedDeparture);
  const totalNights = Math.max(1, daysBetweenUtc(arrivalDay, departureDay));

  const category = stay.room.category;
  const mapping =
    category.accommodationMapping &&
    category.accommodationMapping.active &&
    category.accommodationMapping.institutionId === ctx.institutionId
      ? category.accommodationMapping
      : null;

  const occupants = Math.max(
    1 + stay.companions.length,
    stay.reservation.rooms.length <= 1
      ? stay.reservation.adults + stay.reservation.children
      : 1 + stay.companions.length,
  );

  // Resolve operational nightly rate (never browser-authored)
  let resolvedUnitPrice: number | null = null;
  let currency = stay.reservation.currency || "AOA";

  if (mapping?.centralSalePrice != null) {
    resolvedUnitPrice = Number(mapping.centralSalePrice);
  }

  try {
    const quote = await quoteAccommodation(db, ctx, {
      hotelId: stay.hotelId,
      categoryId: stay.room.categoryId,
      arrivalDate: arrivalDay,
      departureDate: departureDay,
      occupants,
    });
    if (quote.nightCount > 0) {
      // If mapped to SIGESC central product without a cached central price, use the quote;
      // if unmapped, RatePlan quote is the authoritative operational rate.
      if (!mapping || resolvedUnitPrice == null) {
        resolvedUnitPrice = Number((quote.subtotal / quote.nightCount).toFixed(2));
      }
      currency = quote.currency;
    }
  } catch {
    // No active rate plan — fall back cleanly below
  }

  if (resolvedUnitPrice == null) {
    const resRoom = stay.reservation.rooms.find((r) => r.roomId === stay.roomId);
    if (resRoom?.nightlyRate != null) {
      resolvedUnitPrice = Number(resRoom.nightlyRate);
    } else if (category.defaultTariff != null) {
      resolvedUnitPrice = Number(category.defaultTariff);
    }
  }

  const handedOffNights = stay.accountLines
    .filter((l) => l.status === "HANDED_OFF")
    .reduce((sum, l) => sum + Number(l.quantity), 0);

  const unbilledCharges = stay.accountLines.filter((l) => l.status !== "HANDED_OFF");
  const plan = computeAccommodationSyncPlan({
    totalNights,
    unitPrice: resolvedUnitPrice,
    handedOffNights,
    unbilledChargeIds: unbilledCharges.map((l) => l.id),
  });

  if (plan.action === "NOOP") {
    return { action: "NOOP" as const, totalNights };
  }

  if (plan.action === "VOID_UNBILLED") {
    await db.stayAccountCharge.updateMany({
      where: { id: { in: plan.chargeIdsToVoid } },
      data: {
        status: "VOIDED",
        voidReason: `Auto-adjusted after ${reason} (nights=${totalNights}, already handed off=${handedOffNights})`,
      },
    });
    await db.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "StayAccommodationSync",
        entityId: stayId,
        metadata: {
          reason,
          action: plan.action,
          totalNights,
          handedOffNights,
          requiresCentralCreditNote: plan.requiresCentralCreditNote,
        },
      },
    });
    return { action: plan.action, totalNights, requiresCentralCreditNote: plan.requiresCentralCreditNote };
  }

  const label = mapping
    ? `Alojamento · ${category.name} (${mapping.localLabel})`
    : `Alojamento · ${category.name} (${stay.room.code})`;

  if (plan.existingChargeId) {
    await db.stayAccountCharge.update({
      where: { id: plan.existingChargeId },
      data: {
        description: label.slice(0, 255),
        quantity: plan.targetQuantity,
        unitPrice: plan.unitPrice,
        currency,
        catalogMappingId: mapping?.id ?? null,
        centralProductId: mapping?.centralProductId ?? null,
        status: "CONFIRMED",
      },
    });
    // Void any duplicate unbilled accommodation lines beyond the primary one
    const extraIds = unbilledCharges.slice(1).map((c) => c.id);
    if (extraIds.length > 0) {
      await db.stayAccountCharge.updateMany({
        where: { id: { in: extraIds } },
        data: { status: "VOIDED", voidReason: `Consolidated during ${reason}` },
      });
    }
  } else {
    await db.stayAccountCharge.create({
      data: {
        stayId,
        institutionId: ctx.institutionId,
        kind: "ACCOMMODATION",
        status: "CONFIRMED",
        description: label.slice(0, 255),
        quantity: plan.targetQuantity,
        unitPrice: plan.unitPrice,
        currency,
        catalogMappingId: mapping?.id ?? null,
        centralProductId: mapping?.centralProductId ?? null,
        actorUserId: ctx.userId,
      },
    });
  }

  await db.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "StayAccommodationSync",
      entityId: stayId,
      metadata: {
        reason,
        totalNights,
        targetQuantity: plan.targetQuantity,
        unitPrice: plan.unitPrice,
        mappedToSigesc: Boolean(mapping),
        localCode: mapping?.localCode ?? null,
      },
    },
  });

  return {
    action: plan.action,
    totalNights,
    targetQuantity: plan.targetQuantity,
    unitPrice: plan.unitPrice,
    mappedToSigesc: Boolean(mapping),
  };
}
