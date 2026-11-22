import type { PrismaClient, StayStatus } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { assertGuestLinkedForOperations } from "@/modules/guests/guest-service";
import {
  assertRoomAssignable,
  assertValidStayRange,
  toDateOnlyUtc,
} from "@/modules/reservations/availability";

const ACTIVE_STAY: StayStatus[] = ["ACTIVE", "CHECKOUT_PENDING"];

export async function listArrivals(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { hotelId?: string; onDate?: Date },
) {
  const day = toDateOnlyUtc(filters?.onDate ?? new Date());
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  return prisma.reservation.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: { in: ["CONFIRMED", "PENDING"] },
      arrivalDate: { gte: day, lt: next },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
    },
    include: {
      hotel: { select: { id: true, name: true, code: true } },
      rooms: { include: { room: { include: { category: true } } } },
      guests: {
        include: {
          guest: { include: { customerMapping: true } },
        },
      },
      stay: true,
    },
    orderBy: { arrivalDate: "asc" },
    take: 200,
  });
}

export async function listActiveStays(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: {
    hotelId?: string;
    roomId?: string;
    guestId?: string;
    status?: StayStatus;
    departureBefore?: Date;
  },
) {
  return prisma.stay.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: filters?.status
        ? filters.status
        : { in: ACTIVE_STAY },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters?.roomId ? { roomId: filters.roomId } : {}),
      ...(filters?.guestId ? { guestId: filters.guestId } : {}),
      ...(filters?.departureBefore
        ? { expectedDeparture: { lte: toDateOnlyUtc(filters.departureBefore) } }
        : {}),
    },
    include: {
      guest: { include: { customerMapping: true } },
      room: { include: { category: true } },
      companions: {
        where: { removedAt: null },
        include: { guest: { include: { customerMapping: true } } },
      },
      reservation: { select: { id: true, code: true, arrivalDate: true, departureDate: true } },
      checkIn: true,
      accountLines: { where: { status: { not: "VOIDED" } } },
    },
    orderBy: [{ expectedDeparture: "asc" }, { actualArrival: "asc" }],
    take: 200,
  });
}

export async function getStay(prisma: PrismaClient, ctx: TenantContext, stayId: string) {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      guest: { include: { customerMapping: true } },
      room: { include: { category: true } },
      companions: {
        include: { guest: { include: { customerMapping: true } } },
      },
      roomHistory: { orderBy: { transferredAt: "desc" } },
      dateChanges: { orderBy: { createdAt: "desc" } },
      accountLines: { orderBy: { createdAt: "desc" } },
      checkIn: true,
      checkOut: true,
      reservation: {
        include: {
          rooms: { include: { room: true } },
          guests: { include: { guest: true } },
        },
      },
    },
  });
  if (!stay) throw new Error("Stay not found");
  assertSameInstitution(ctx, stay.institutionId);
  return stay;
}

function assertRoomReadyForCheckIn(room: {
  housekeepingStatus: string;
  maintenanceStatus: string;
  occupancyStatus: string;
  capacity: number;
}) {
  if (room.maintenanceStatus === "UNDER_MAINTENANCE" || room.maintenanceStatus === "OUT_OF_SERVICE") {
    throw new Error("Room is blocked by maintenance");
  }
  if (room.housekeepingStatus !== "CLEAN") {
    throw new Error("Room is not housekeeping-ready (must be CLEAN)");
  }
  if (room.occupancyStatus === "OCCUPIED") {
    throw new Error("Room is already occupied");
  }
}

/**
 * Check-in: activate Stay, occupy room, record CheckInRecord.
 * Requires LINKED central customer for primary guest (and companions if provided).
 */
export async function checkInReservation(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    reservationId: string;
    roomId?: string;
    companionGuestIds?: string[];
    actualArrival?: Date | string;
    observations?: string;
    notes?: string;
  },
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: {
      rooms: true,
      guests: { include: { guest: { include: { customerMapping: true } } } },
      stay: true,
    },
  });
  if (!reservation) throw new Error("Reservation not found");
  assertSameInstitution(ctx, reservation.institutionId);

  if (reservation.stay) {
    throw new Error("Reservation already has a stay (duplicate check-in)");
  }
  if (!["CONFIRMED", "PENDING"].includes(reservation.status)) {
    throw new Error(`Reservation status ${reservation.status} is not eligible for check-in`);
  }

  const primary =
    reservation.guests.find((g) => g.isPrimary) ?? reservation.guests[0];
  if (!primary) throw new Error("Reservation has no guest assigned");
  await assertGuestLinkedForOperations(prisma, ctx, primary.guestId);

  const roomId = input.roomId ?? reservation.rooms[0]?.roomId;
  if (!roomId) throw new Error("No room assigned to reservation");

  const companionIds = [...new Set(input.companionGuestIds ?? [])].filter(
    (id) => id !== primary.guestId,
  );
  for (const cid of companionIds) {
    await assertGuestLinkedForOperations(prisma, ctx, cid);
  }

  const occupantCount = 1 + companionIds.length;
  const arrival = input.actualArrival ? new Date(input.actualArrival) : new Date();
  const expectedDeparture = toDateOnlyUtc(reservation.departureDate);

  return prisma.$transaction(async (tx) => {
    // Conditional claim: only update if still CONFIRMED/PENDING
    const claimed = await tx.reservation.updateMany({
      where: {
        id: reservation.id,
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      data: { status: "CHECKED_IN" },
    });
    if (claimed.count !== 1) {
      throw new Error("Reservation is no longer eligible for check-in (concurrent claim)");
    }

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || room.hotelId !== reservation.hotelId) {
      throw new Error("Room not found for this hotel");
    }
    assertRoomReadyForCheckIn(room);
    if (room.capacity < occupantCount) {
      throw new Error(`Room capacity ${room.capacity} is insufficient for ${occupantCount} occupants`);
    }

    await assertRoomAssignable(tx, {
      roomId,
      hotelId: reservation.hotelId,
      arrival: toDateOnlyUtc(reservation.arrivalDate),
      departure: expectedDeparture,
      excludeReservationId: reservation.id,
    });

    // Ensure room assignment exists on reservation
    await tx.reservationRoom.upsert({
      where: {
        reservationId_roomId: { reservationId: reservation.id, roomId },
      },
      create: {
        reservationId: reservation.id,
        roomId,
        arrivalDate: toDateOnlyUtc(reservation.arrivalDate),
        departureDate: expectedDeparture,
      },
      update: {},
    });

    const stay = await tx.stay.create({
      data: {
        hotelId: reservation.hotelId,
        institutionId: reservation.institutionId,
        reservationId: reservation.id,
        roomId,
        guestId: primary.guestId,
        status: "ACTIVE",
        actualArrival: arrival,
        expectedDeparture,
        originalDeparture: expectedDeparture,
        observations: input.observations?.trim() || null,
        companions: {
          create: companionIds.map((guestId) => ({ guestId })),
        },
        checkIn: {
          create: {
            reservationId: reservation.id,
            checkedInAt: arrival,
            actorUserId: ctx.userId,
            notes: input.notes?.trim() || null,
            occupantCount,
          },
        },
      },
      include: {
        checkIn: true,
        companions: { include: { guest: true } },
        guest: true,
        room: true,
      },
    });

    await tx.room.update({
      where: { id: roomId },
      data: { occupancyStatus: "OCCUPIED" },
    });

    await tx.reservationEvent.create({
      data: {
        reservationId: reservation.id,
        fromStatus: reservation.status,
        toStatus: "CHECKED_IN",
        note: "Check-in completed",
        actorUserId: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "StayCheckIn",
        entityId: stay.id,
        metadata: {
          reservationId: reservation.id,
          roomId,
          companionCount: companionIds.length,
        },
      },
    });

    return stay;
  });
}

export async function addCompanion(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  guestId: string,
) {
  const stay = await getStay(prisma, ctx, stayId);
  if (!ACTIVE_STAY.includes(stay.status)) {
    throw new Error("Companions can only be added to an active stay");
  }
  if (stay.guestId === guestId) {
    throw new Error("Primary guest cannot be added as companion");
  }
  await assertGuestLinkedForOperations(prisma, ctx, guestId);

  const room = stay.room;
  const activeCompanions = stay.companions.filter((c) => !c.removedAt).length;
  if (room.capacity < 1 + activeCompanions + 1) {
    throw new Error("Room capacity exceeded");
  }

  try {
    return await prisma.stayCompanion.create({
      data: { stayId, guestId },
      include: { guest: { include: { customerMapping: true } } },
    });
  } catch {
    throw new Error("Guest is already a companion on this stay");
  }
}

export async function removeCompanion(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  guestId: string,
) {
  await getStay(prisma, ctx, stayId);
  const row = await prisma.stayCompanion.findUnique({
    where: { stayId_guestId: { stayId, guestId } },
  });
  if (!row || row.removedAt) throw new Error("Companion not found on stay");
  return prisma.stayCompanion.update({
    where: { id: row.id },
    data: { removedAt: new Date() },
  });
}

export async function transferStayRoom(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input: { toRoomId: string; reason: string },
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Transfer reason is required");

  return prisma.$transaction(async (tx) => {
    const stay = await tx.stay.findUnique({
      where: { id: stayId },
      include: {
        companions: { where: { removedAt: null } },
        reservation: true,
      },
    });
    if (!stay) throw new Error("Stay not found");
    assertSameInstitution(ctx, stay.institutionId);
    if (!ACTIVE_STAY.includes(stay.status)) {
      throw new Error("Only active stays can transfer rooms");
    }
    if (stay.roomId === input.toRoomId) {
      throw new Error("Destination room is the same as current room");
    }

    const dest = await tx.room.findUnique({ where: { id: input.toRoomId } });
    if (!dest || dest.hotelId !== stay.hotelId) {
      throw new Error("Destination room not found for this hotel");
    }
    assertRoomReadyForCheckIn(dest);
    const occupants = 1 + stay.companions.length;
    if (dest.capacity < occupants) {
      throw new Error("Destination room capacity is insufficient");
    }

    await assertRoomAssignable(tx, {
      roomId: input.toRoomId,
      hotelId: stay.hotelId,
      arrival: toDateOnlyUtc(new Date()),
      departure: toDateOnlyUtc(stay.expectedDeparture),
      excludeReservationId: stay.reservationId,
    });

    const fromRoomId = stay.roomId;

    const moved = await tx.stay.updateMany({
      where: { id: stayId, roomId: fromRoomId, status: { in: ACTIVE_STAY } },
      data: { roomId: input.toRoomId },
    });
    if (moved.count !== 1) {
      throw new Error("Stay room changed concurrently — transfer aborted");
    }

    await tx.stayRoomHistory.create({
      data: {
        stayId,
        fromRoomId,
        toRoomId: input.toRoomId,
        reason,
        actorUserId: ctx.userId,
      },
    });

    await tx.room.update({
      where: { id: fromRoomId },
      data: { occupancyStatus: "AVAILABLE", housekeepingStatus: "DIRTY" },
    });
    await tx.room.update({
      where: { id: input.toRoomId },
      data: { occupancyStatus: "OCCUPIED" },
    });

    await tx.housekeepingTask.create({
      data: {
        hotelId: stay.hotelId,
        roomId: fromRoomId,
        stayId,
        kind: "TURNOVER",
        status: "PENDING",
        priority: "HIGH",
        notes: `Room transfer from stay ${stayId}: ${reason}`,
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "StayRoomTransfer",
        entityId: stayId,
        metadata: { fromRoomId, toRoomId: input.toRoomId, reason },
      },
    });

    return tx.stay.findUniqueOrThrow({
      where: { id: stayId },
      include: { room: true, roomHistory: { orderBy: { transferredAt: "desc" }, take: 5 } },
    });
  });
}

export async function extendStay(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input: { newDeparture: Date | string; reason?: string },
) {
  const stay = await getStay(prisma, ctx, stayId);
  if (!ACTIVE_STAY.includes(stay.status)) {
    throw new Error("Only active stays can be extended");
  }
  const previous = toDateOnlyUtc(stay.expectedDeparture);
  const next = toDateOnlyUtc(input.newDeparture);
  assertValidStayRange(toDateOnlyUtc(stay.actualArrival), next);
  if (next.getTime() <= previous.getTime()) {
    throw new Error("New departure must be after the current expected departure");
  }

  await prisma.$transaction(async (tx) => {
    await assertRoomAssignable(tx, {
      roomId: stay.roomId,
      hotelId: stay.hotelId,
      arrival: previous,
      departure: next,
      excludeReservationId: stay.reservationId,
    });

    await tx.stay.update({
      where: { id: stayId },
      data: {
        expectedDeparture: next,
        originalDeparture: stay.originalDeparture ?? previous,
      },
    });
    await tx.reservation.update({
      where: { id: stay.reservationId },
      data: { departureDate: next },
    });
    await tx.reservationRoom.updateMany({
      where: { reservationId: stay.reservationId, roomId: stay.roomId },
      data: { departureDate: next },
    });
    await tx.stayDateChange.create({
      data: {
        stayId,
        kind: "EXTENSION",
        previousDeparture: previous,
        newDeparture: next,
        reason: input.reason?.trim() || null,
        actorUserId: ctx.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "StayExtension",
        entityId: stayId,
        metadata: {
          previousDeparture: previous.toISOString(),
          newDeparture: next.toISOString(),
        },
      },
    });
  });
  return getStay(prisma, ctx, stayId);
}

export async function markEarlyDepartureDate(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input: { newDeparture: Date | string; reason?: string },
) {
  const stay = await getStay(prisma, ctx, stayId);
  if (!ACTIVE_STAY.includes(stay.status)) {
    throw new Error("Only active stays can change departure");
  }
  const previous = toDateOnlyUtc(stay.expectedDeparture);
  const next = toDateOnlyUtc(input.newDeparture);
  if (next.getTime() >= previous.getTime()) {
    throw new Error("Early departure date must be before the current expected departure");
  }
  if (next.getTime() <= toDateOnlyUtc(stay.actualArrival).getTime()) {
    throw new Error("Departure must be after arrival");
  }

  await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: stayId },
      data: {
        expectedDeparture: next,
        originalDeparture: stay.originalDeparture ?? previous,
      },
    });
    await tx.reservation.update({
      where: { id: stay.reservationId },
      data: { departureDate: next },
    });
    await tx.stayDateChange.create({
      data: {
        stayId,
        kind: "EARLY_DEPARTURE",
        previousDeparture: previous,
        newDeparture: next,
        reason: input.reason?.trim() || null,
        actorUserId: ctx.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "StayEarlyDeparture",
        entityId: stayId,
        metadata: {
          previousDeparture: previous.toISOString(),
          newDeparture: next.toISOString(),
        },
      },
    });
  });
  return getStay(prisma, ctx, stayId);
}
