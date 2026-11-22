import type { FinancialHandoffStatus, PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getStay } from "./stay-service";
import {
  createInvoiceDraft,
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
  const openHk = await prisma.housekeepingTask.count({
    where: {
      roomId: stay.roomId,
      status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"] },
      kind: { not: "TURNOVER" },
    },
  });
  const blockingMaint = await prisma.maintenanceRequest.count({
    where: {
      roomId: stay.roomId,
      blocksRoom: true,
      status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
    },
  });

  const charges = stay.accountLines.filter((l) => l.status !== "VOIDED");
  return {
    stay,
    readiness: {
      hasLinkedCustomer: stay.guest.customerMapping?.syncStatus === "LINKED",
      openHousekeepingNonTurnover: openHk,
      blockingMaintenance: blockingMaint,
      chargeCount: charges.length,
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

  const lines = input?.mappingLocalCodes ?? [];
  if (input?.requestProforma) {
    if (lines.length === 0) {
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
    handoff = "REQUESTED";
    try {
      const draft = await createInvoiceDraft(prisma, ctx, {
        guestId: stay.guestId,
        reservationId: stay.reservationId,
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
    } catch (err) {
      handoff = "FAILED";
      if (!input?.allowFinancialPending) {
        throw err;
      }
    }
  }

  const checkedOutAt = new Date();

  return prisma.$transaction(async (tx) => {
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

    // Release occupancy — room becomes DIRTY, not immediately ready
    await tx.room.update({
      where: { id: stay.roomId },
      data: {
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "DIRTY",
      },
    });

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

    if (invoiceId) {
      await tx.stayAccountCharge.updateMany({
        where: { stayId, status: "CONFIRMED" },
        data: { status: "HANDED_OFF", invoiceIntegrationId: invoiceId },
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
  filters?: { hotelId?: string; onDate?: Date },
) {
  const day = filters?.onDate ? new Date(filters.onDate) : new Date();
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return prisma.stay.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
      expectedDeparture: { gte: start, lt: end },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
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
