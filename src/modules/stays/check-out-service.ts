import type { FinancialHandoffStatus, PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getStay } from "./stay-service";
import {
  lockRoomsForUpdate,
  syncRoomOccupancyStatus,
  toDateOnlyUtc,
} from "@/modules/reservations/availability";
import {
  addItemsToInvoice,
  createInvoiceDraft,
  findEligibleInvoiceForStay,
  isEditableCentralState,
  submitInvoice,
} from "@/modules/sigesc-integration/invoices/invoice-service";

/**
 * Operational check-out with optional Cotação/Proforma handoff.
 * Never marks financial process as published/paid — only Aggregate Cotação/Proforma states.
 */
export async function prepareCheckOut(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
) {
  const stay = await getStay(prisma, ctx, stayId);
  const [openHk, blockingMaint, eligibleInvoice] = await Promise.all([
    prisma.housekeepingTask.count({
      where: {
        roomId: stay.roomId,
        status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"] },
        kind: { not: "TURNOVER" },
      },
    }),
    prisma.maintenanceRequest.count({
      where: {
        roomId: stay.roomId,
        blocksRoom: true,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
      },
    }),
    findEligibleInvoiceForStay(prisma, ctx, stayId),
  ]);

  const charges = stay.accountLines.filter((l) => l.status !== "VOIDED");
  const unbilledMapped = charges.filter(
    (l) => l.status === "CONFIRMED" && Boolean(l.catalogMappingId),
  );
  const mappingIds = [
    ...new Set(unbilledMapped.map((l) => l.catalogMappingId).filter((id): id is string => Boolean(id))),
  ];
  const mappings = mappingIds.length
    ? await prisma.productCatalogMapping.findMany({
        where: { institutionId: ctx.institutionId, id: { in: mappingIds }, active: true },
        select: { id: true, localCode: true, localLabel: true },
      })
    : [];
  const mappingById = new Map(mappings.map((m) => [m.id, m] as const));

  const suggestedLines = unbilledMapped
    .map((l) => {
      const m = l.catalogMappingId ? mappingById.get(l.catalogMappingId) : undefined;
      if (!m) return null;
      return {
        mappingLocalCode: m.localCode,
        label: m.localLabel,
        quantity: Number(l.quantity),
      };
    })
    .filter((x): x is { mappingLocalCode: string; label: string; quantity: number } => Boolean(x));

  return {
    stay,
    eligibleInvoice: eligibleInvoice
      ? {
          id: eligibleInvoice.id,
          externalId: eligibleInvoice.externalId,
          saleKey: eligibleInvoice.saleKey,
          status: eligibleInvoice.status,
          centralState: eligibleInvoice.centralState,
          centralTotal:
            eligibleInvoice.centralTotal != null ? Number(eligibleInvoice.centralTotal) : null,
          currency: eligibleInvoice.currency,
        }
      : null,
    suggestedLines,
    readiness: {
      hasLinkedCustomer: stay.guest.customerMapping?.syncStatus === "LINKED",
      openHousekeepingNonTurnover: openHk,
      blockingMaintenance: blockingMaint,
      chargeCount: charges.length,
      unbilledMappedChargeCount: suggestedLines.length,
      canOperationallyComplete: stay.status === "ACTIVE" || stay.status === "CHECKOUT_PENDING",
    },
  };
}

export async function completeCheckOut(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input?: {
    notes?: string;
    requestProforma?: boolean;
    mappingLocalCodes?: Array<{ mappingLocalCode: string; quantity: number }>;
    allowFinancialPending?: boolean;
  },
) {
  const prep = await prepareCheckOut(prisma, ctx, stayId);
  const stay = prep.stay;
  if (stay.checkOut) throw new Error("Stay already checked out (duplicate)");
  if (!["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status)) {
    throw new Error(`Stay status ${stay.status} cannot be checked out`);
  }
  if (stay.guest.customerMapping?.syncStatus !== "LINKED" || !stay.guest.customerMapping.externalCustomerId) {
    throw new Error("Primary guest must have a valid SIGESC Central customer before check-out");
  }

  let invoiceId: string | undefined;
  let handoff: FinancialHandoffStatus = "NOT_REQUIRED";
  let financialExternalRef: string | null = null;
  let financialConfirmedAt: Date | null = null;

  const lines =
    input?.mappingLocalCodes && input.mappingLocalCodes.length > 0
      ? input.mappingLocalCodes
      : prep.suggestedLines.map((l) => ({
          mappingLocalCode: l.mappingLocalCode,
          quantity: l.quantity,
        }));

  if (input?.requestProforma) {
    const existingDoc = prep.eligibleInvoice;
    if (lines.length === 0) {
      if (existingDoc && existingDoc.status === "CREATED" && existingDoc.saleKey) {
        invoiceId = existingDoc.id;
        financialExternalRef = existingDoc.saleKey;
        handoff = "CENTRAL_CONFIRMED";
        financialConfirmedAt = new Date();
      } else {
        handoff = "PENDING";
        await prisma.stay.update({
          where: { id: stayId },
          data: { status: "CHECKOUT_PENDING" },
        });
        return {
          stay: await getStay(prisma, ctx, stayId),
          handoff,
          message:
            "Provide catalog mapping lines to request Proforma, or set requestProforma=false for ops-only departure.",
        };
      }
    } else {
      handoff = "REQUESTED";
      try {
        if (
          existingDoc &&
          existingDoc.status === "CREATED" &&
          existingDoc.saleKey &&
          isEditableCentralState(existingDoc.centralState)
        ) {
          const appended = await addItemsToInvoice(prisma, ctx, existingDoc.id, lines, {
            idempotencyKey: `checkout-${stayId}-${existingDoc.id}`,
          });
          invoiceId = appended.id;
          financialExternalRef = appended.saleKey ?? appended.externalId;
          handoff = "CENTRAL_CONFIRMED";
          financialConfirmedAt = new Date();
        } else {
          const draft = await createInvoiceDraft(prisma, ctx, {
            guestId: stay.guestId,
            reservationId: stay.reservationId,
            stayId: stay.id,
            hotelId: stay.hotelId,
            state: "Proforma",
            lines,
            notes: `Stay check-out ${stayId}`,
          });
          const submitted = await submitInvoice(prisma, ctx, draft.id);
          invoiceId = submitted.id;
          financialExternalRef = submitted.saleKey ?? submitted.externalId;
          if (submitted.status === "CREATED") {
            handoff = "CENTRAL_CONFIRMED";
            financialConfirmedAt = new Date();
          } else if (submitted.status === "RECONCILIATION_REQUIRED") {
            handoff = "RECONCILIATION_PENDING";
            if (!input?.allowFinancialPending) {
              await prisma.stay.update({
                where: { id: stayId },
                data: { status: "CHECKOUT_PENDING" },
              });
              return {
                stay: await getStay(prisma, ctx, stayId),
                handoff,
                invoiceId,
                message:
                  "Financial handoff requires reconciliation. Stay marked CHECKOUT_PENDING — operational departure not completed.",
              };
            }
          } else {
            handoff = "FAILED";
            if (!input?.allowFinancialPending) {
              throw new Error(`Financial handoff failed with status ${submitted.status}`);
            }
          }
        }
      } catch (err) {
        handoff = "FAILED";
        if (!input?.allowFinancialPending) {
          throw err;
        }
      }
    }
  }

  const checkedOutAt = new Date();
  const checkedOutDay = toDateOnlyUtc(checkedOutAt);

  return prisma.$transaction(async (tx) => {
    await lockRoomsForUpdate(tx, [stay.roomId]);

    const claimed = await tx.stay.updateMany({
      where: {
        id: stayId,
        status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
        checkOut: null,
      },
      data: {
        status: "COMPLETED",
        actualDeparture: checkedOutAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("Stay is no longer eligible for check-out (concurrent claim)");
    }

    await tx.checkOutRecord.create({
      data: {
        stayId,
        reservationId: stay.reservationId,
        checkedOutAt,
        actorUserId: ctx.userId,
        notes: input?.notes?.trim() || null,
        financialHandoffStatus: handoff,
        financialExternalRef,
        financialConfirmedAt,
        invoiceIntegrationId: invoiceId ?? null,
        operationalComplete: true,
      },
    });

    // Release freed nights on ReservationRoom if departing earlier than expected
    if (checkedOutDay < toDateOnlyUtc(stay.expectedDeparture)) {
      await tx.reservationRoom.updateMany({
        where: { reservationId: stay.reservationId, roomId: stay.roomId },
        data: { departureDate: checkedOutDay },
      });
    }

    // For multi-room reservations, only mark Reservation CHECKED_OUT once all rooms
    // have checked out and no other active stays remain on the reservation.
    const [otherActiveStays, allReservationRooms, allReservationStays] = await Promise.all([
      tx.stay.count({
        where: {
          reservationId: stay.reservationId,
          id: { not: stayId },
          status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
        },
      }),
      tx.reservationRoom.findMany({
        where: { reservationId: stay.reservationId },
        select: { roomId: true },
      }),
      tx.stay.findMany({
        where: { reservationId: stay.reservationId },
        select: { roomId: true },
      }),
    ]);

    const stayedRoomIds = new Set(allReservationStays.map((s) => s.roomId));
    const hasPendingRooms = allReservationRooms.some((rr) => !stayedRoomIds.has(rr.roomId));

    if (otherActiveStays === 0 && !hasPendingRooms) {
      await tx.reservation.update({
        where: { id: stay.reservationId },
        data: { status: "CHECKED_OUT" },
      });
      await tx.reservationEvent.create({
        data: {
          reservationId: stay.reservationId,
          fromStatus: "CHECKED_IN",
          toStatus: "CHECKED_OUT",
          note: "Check-out completed",
          actorUserId: ctx.userId,
        },
      });
    } else {
      await tx.reservationEvent.create({
        data: {
          reservationId: stay.reservationId,
          fromStatus: "CHECKED_IN",
          toStatus: "CHECKED_IN",
          note: `Partial check-out completed (room ${stay.room.code})`,
          actorUserId: ctx.userId,
        },
      });
    }

    // Release occupancy — room becomes DIRTY, and occupancyStatus reflects live truth
    // (AVAILABLE if free today, RESERVED if another reservation arrives today).
    await tx.room.update({
      where: { id: stay.roomId },
      data: {
        housekeepingStatus: "DIRTY",
      },
    });
    await syncRoomOccupancyStatus(tx, stay.roomId);

    await tx.housekeepingTask.create({
      data: {
        hotelId: stay.hotelId,
        roomId: stay.roomId,
        stayId,
        kind: "TURNOVER",
        status: "PENDING",
        priority: "HIGH",
        notes: `Post check-out cleaning for stay ${stayId}`,
      },
    });

    // Only mark charges HANDED_OFF when SIGESC central confirmation succeeded
    if (invoiceId && handoff === "CENTRAL_CONFIRMED") {
      await tx.stayAccountCharge.updateMany({
        where: { stayId, status: "CONFIRMED" },
        data: { status: "HANDED_OFF", invoiceIntegrationId: invoiceId },
      });
    } else if (invoiceId) {
      await tx.stayAccountCharge.updateMany({
        where: { stayId, status: "CONFIRMED" },
        data: { invoiceIntegrationId: invoiceId },
      });
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "StayCheckOut",
        entityId: stayId,
        metadata: { handoff, invoiceId },
      },
    });

    return {
      stay: await tx.stay.findUniqueOrThrow({
        where: { id: stayId },
        include: { checkOut: true, room: true, guest: true },
      }),
      handoff,
      invoiceId,
    };
  });
}

export async function listDepartures(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: {
    hotelId?: string;
    onDate?: Date;
    includeOverdue?: boolean;
    scope?: "today" | "overdue" | "all";
    focusStayId?: string;
  },
) {
  const day = filters?.onDate ? new Date(filters.onDate) : new Date();
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const effectiveScope =
    filters?.scope ?? (filters?.includeOverdue ? "overdue" : "today");

  const dateFilter =
    effectiveScope === "all"
      ? {}
      : effectiveScope === "overdue"
        ? { expectedDeparture: { lt: end } }
        : { expectedDeparture: { gte: start, lt: end } };

  return prisma.stay.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(effectiveScope === "all"
        ? {}
        : filters?.focusStayId
          ? { OR: [dateFilter, { id: filters.focusStayId }] }
          : dateFilter),
    },
    include: {
      guest: { include: { customerMapping: true } },
      room: true,
      reservation: { select: { id: true, code: true } },
      accountLines: { where: { status: { not: "VOIDED" } } },
    },
    orderBy: { expectedDeparture: "asc" },
    take: 200,
  });
}

export async function assertStayOwned(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
) {
  const stay = await prisma.stay.findUnique({ where: { id: stayId } });
  if (!stay) throw new Error("Stay not found");
  assertSameInstitution(ctx, stay.institutionId);
  return stay;
}
