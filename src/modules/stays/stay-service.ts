import type { PrismaClient, StayStatus } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { assertGuestLinkedForOperations } from "@/modules/guests/guest-service";
import {
  assertRoomAssignable,
  assertValidStayRange,
  daysBetweenUtc,
  lockRoomsForUpdate,
  syncRoomOccupancyStatus,
  toDateOnlyUtc,
} from "@/modules/reservations/availability";
import { syncStayAccommodationCharges } from "./accommodation-billing";

const ACTIVE_STAY: StayStatus[] = ["ACTIVE", "CHECKOUT_PENDING"];

export async function listArrivals(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { hotelId?: string; onDate?: Date },
) {
  const day = toDateOnlyUtc(filters?.onDate ?? new Date());
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  const rows = await prisma.reservation.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: { in: ["CONFIRMED", "PENDING", "CHECKED_IN"] },
      // Today's arrivals OR late arrivals whose departure is still strictly in the future
      OR: [
        { arrivalDate: { gte: day, lt: next } },
        { arrivalDate: { lt: day }, departureDate: { gt: day } },
      ],
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
      stays: { select: { id: true, roomId: true, status: true } },
    },
    orderBy: [{ arrivalDate: "asc" }, { expectedCheckInTime: "asc" }],
    take: 200,
  });

  // Include CONFIRMED/PENDING arrivals, plus CHECKED_IN multi-room reservations that still have rooms awaiting check-in
  return rows.filter((r) => {
    if (r.status !== "CHECKED_IN") return true;
    const checkedRoomIds = new Set(r.stays.map((s) => s.roomId));
    return r.rooms.some((rr) => !checkedRoomIds.has(rr.roomId));
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
 * Check-in: activate Stay, occupy room, record CheckInRecord, and post initial
 * operational accommodation charge (linked to SIGESC catalog when mapped).
 * Supports multi-room reservations (one Stay per room).
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
      stays: { select: { id: true, roomId: true, status: true } },
    },
  });
  if (!reservation) throw new Error("Reservation not found");
  assertSameInstitution(ctx, reservation.institutionId);

  if (!["CONFIRMED", "PENDING", "CHECKED_IN"].includes(reservation.status)) {
    throw new Error(`Reservation status ${reservation.status} is not eligible for check-in`);
  }

  const primary =
    reservation.guests.find((g) => g.isPrimary) ?? reservation.guests[0];
  if (!primary) throw new Error("Reservation has no guest assigned");
  await assertGuestLinkedForOperations(prisma, ctx, primary.guestId);

  const checkedInRoomIds = new Set(reservation.stays.map((s) => s.roomId));
  const nextPendingRoom = reservation.rooms.find((rr) => !checkedInRoomIds.has(rr.roomId));
  const roomId = input.roomId ?? nextPendingRoom?.roomId ?? reservation.rooms[0]?.roomId;
  if (!roomId) throw new Error("No room assigned to reservation");

  if (checkedInRoomIds.has(roomId)) {
    throw new Error("Reservation already has a stay for this room (duplicate check-in)");
  }
  if (
    reservation.status === "CHECKED_IN" &&
    reservation.rooms.length <= 1 &&
    reservation.stays.length > 0
  ) {
    throw new Error("Reservation already has a stay (duplicate check-in)");
  }

  const companionIds = [...new Set(input.companionGuestIds ?? [])].filter(
    (id) => id !== primary.guestId,
  );
  for (const cid of companionIds) {
    await assertGuestLinkedForOperations(prisma, ctx, cid);
  }

  const occupantCount = 1 + companionIds.length;
  const effectiveOccupants =
    reservation.rooms.length <= 1
      ? Math.max(occupantCount, reservation.adults + reservation.children)
      : occupantCount;
  const arrival = input.actualArrival ? new Date(input.actualArrival) : new Date();
  const resRoom = reservation.rooms.find((rr) => rr.roomId === roomId);
  const expectedDeparture = toDateOnlyUtc(resRoom?.departureDate ?? reservation.departureDate);

  return prisma.$transaction(async (tx) => {
    await lockRoomsForUpdate(tx, [roomId]);

    // Re-check duplicate stay for this reservation+room inside the locked transaction
    const existingStayForRoom = await tx.stay.findFirst({
      where: {
        reservationId: reservation.id,
        roomId,
      },
      select: { id: true },
    });
    if (existingStayForRoom) {
      throw new Error("Reservation already has a stay for this room (concurrent claim)");
    }

    const freshReservation = await tx.reservation.findUnique({
      where: { id: reservation.id },
      select: { status: true },
    });
    if (
      !freshReservation ||
      !["CONFIRMED", "PENDING", "CHECKED_IN"].includes(freshReservation.status)
    ) {
      throw new Error("Reservation is no longer eligible for check-in (concurrent claim)");
    }

    const transitionedToCheckedIn = freshReservation.status !== "CHECKED_IN";
    if (transitionedToCheckedIn) {
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
    }

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || room.hotelId !== reservation.hotelId) {
      throw new Error("Room not found for this hotel");
    }
    assertRoomReadyForCheckIn(room);
    if (room.capacity < effectiveOccupants) {
      throw new Error(
        `Room capacity ${room.capacity} is insufficient for ${effectiveOccupants} occupants`,
      );
    }

    await assertRoomAssignable(tx, {
      roomId,
      hotelId: reservation.hotelId,
      arrival: toDateOnlyUtc(resRoom?.arrivalDate ?? reservation.arrivalDate),
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

    await syncRoomOccupancyStatus(tx, roomId);

    // Bridge RatePlan / RoomCategory SIGESC catalog mapping into the stay account
    await syncStayAccommodationCharges(tx, ctx, stay.id, "CHECK_IN");

    await tx.reservationEvent.create({
      data: {
        reservationId: reservation.id,
        fromStatus: freshReservation.status,
        toStatus: "CHECKED_IN",
        note: transitionedToCheckedIn
          ? `Check-in completed (room ${room.code})`
          : `Additional room check-in completed (room ${room.code})`,
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

    const fromRoomId = stay.roomId;
    await lockRoomsForUpdate(tx, [fromRoomId, input.toRoomId]);

    const dest = await tx.room.findUnique({ where: { id: input.toRoomId } });
    if (!dest || dest.hotelId !== stay.hotelId) {
      throw new Error("Destination room not found for this hotel");
    }
    assertRoomReadyForCheckIn(dest);
    const occupants = 1 + stay.companions.length;
    if (dest.capacity < occupants) {
      throw new Error("Destination room capacity is insufficient");
    }

    const today = toDateOnlyUtc(new Date());
    const departureDay = toDateOnlyUtc(stay.expectedDeparture);

    await assertRoomAssignable(tx, {
      roomId: input.toRoomId,
      hotelId: stay.hotelId,
      arrival: today,
      departure: departureDay,
      excludeReservationId: stay.reservationId,
      excludeStayId: stayId,
    });

    const moved = await tx.stay.updateMany({
      where: { id: stayId, roomId: fromRoomId, status: { in: ACTIVE_STAY } },
      data: { roomId: input.toRoomId },
    });
    if (moved.count !== 1) {
      throw new Error("Stay room changed concurrently — transfer aborted");
    }

    // Keep ReservationRoom atomically synchronized so the old room is released
    // and the destination room is protected against overlapping bookings.
    const existingOldLink = await tx.reservationRoom.findUnique({
      where: {
        reservationId_roomId: { reservationId: stay.reservationId, roomId: fromRoomId },
      },
    });
    if (existingOldLink) {
      await tx.reservationRoom.delete({ where: { id: existingOldLink.id } });
    }
    await tx.reservationRoom.upsert({
      where: {
        reservationId_roomId: { reservationId: stay.reservationId, roomId: input.toRoomId },
      },
      create: {
        reservationId: stay.reservationId,
        roomId: input.toRoomId,
        arrivalDate: existingOldLink?.arrivalDate ?? toDateOnlyUtc(stay.actualArrival),
        departureDate: departureDay,
        nightlyRate: existingOldLink?.nightlyRate ?? null,
      },
      update: {
        departureDate: departureDay,
      },
    });

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
      data: { housekeepingStatus: "DIRTY" },
    });
    await syncRoomOccupancyStatus(tx, fromRoomId);
    await syncRoomOccupancyStatus(tx, input.toRoomId);

    // Recalculate unbilled accommodation charge if room category / rate changed
    await syncStayAccommodationCharges(tx, ctx, stayId, "TRANSFER");

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
  const arrivalDay = toDateOnlyUtc(stay.actualArrival);
  assertValidStayRange(arrivalDay, next);
  if (next.getTime() <= previous.getTime()) {
    throw new Error("New departure must be after the current expected departure");
  }

  const hotelSettings = await prisma.hotelSettings.findUnique({
    where: { hotelId: stay.hotelId },
    select: { maxStayNights: true },
  });
  const totalNights = daysBetweenUtc(arrivalDay, next);
  if (hotelSettings?.maxStayNights != null && totalNights > hotelSettings.maxStayNights) {
    throw new Error(
      `Stay exceeds hotel maximum of ${hotelSettings.maxStayNights} night(s)`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await lockRoomsForUpdate(tx, [stay.roomId]);

    await assertRoomAssignable(tx, {
      roomId: stay.roomId,
      hotelId: stay.hotelId,
      arrival: previous,
      departure: next,
      excludeReservationId: stay.reservationId,
      excludeStayId: stayId,
    });

    await tx.stay.update({
      where: { id: stayId },
      data: {
        expectedDeparture: next,
        originalDeparture: stay.originalDeparture ?? previous,
      },
    });
    await tx.reservationRoom.updateMany({
      where: { reservationId: stay.reservationId, roomId: stay.roomId },
      data: { departureDate: next },
    });

    // Keep Reservation.departureDate aligned with the latest departure among its rooms
    const maxRoomDep = await tx.reservationRoom.aggregate({
      where: { reservationId: stay.reservationId },
      _max: { departureDate: true },
    });
    await tx.reservation.update({
      where: { id: stay.reservationId },
      data: { departureDate: maxRoomDep._max.departureDate ?? next },
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

    await syncStayAccommodationCharges(tx, ctx, stayId, "EXTENSION");

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
    await lockRoomsForUpdate(tx, [stay.roomId]);

    await tx.stay.update({
      where: { id: stayId },
      data: {
        expectedDeparture: next,
        originalDeparture: stay.originalDeparture ?? previous,
      },
    });
    // Sync ReservationRoom so freed future nights are immediately available for new bookings
    await tx.reservationRoom.updateMany({
      where: { reservationId: stay.reservationId, roomId: stay.roomId },
      data: { departureDate: next },
    });

    const maxRoomDep = await tx.reservationRoom.aggregate({
      where: { reservationId: stay.reservationId },
      _max: { departureDate: true },
    });
    await tx.reservation.update({
      where: { id: stay.reservationId },
      data: { departureDate: maxRoomDep._max.departureDate ?? next },
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

    await syncStayAccommodationCharges(tx, ctx, stayId, "EARLY_DEPARTURE");

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
