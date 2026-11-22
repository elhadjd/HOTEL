import type { PrismaClient, ReservationStatus } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getHotel } from "@/modules/hotels/hotel-service";
import {
  assertRoomAssignable,
  assertValidStayRange,
  toDateOnlyUtc,
} from "./availability";

function reservationCode(): string {
  const n = Date.now().toString(36).toUpperCase();
  return `RSV-${n.slice(-8)}`;
}

export async function listReservations(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: {
    hotelId?: string;
    status?: ReservationStatus;
    from?: Date;
    to?: Date;
  },
) {
  if (filters?.hotelId) await getHotel(prisma, ctx, filters.hotelId);

  return prisma.reservation.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.from || filters?.to
        ? {
            arrivalDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      hotel: { select: { id: true, name: true, code: true } },
      rooms: { include: { room: { include: { category: true } } } },
      guests: { include: { guest: true } },
    },
    orderBy: [{ arrivalDate: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export async function getReservation(
  prisma: PrismaClient,
  ctx: TenantContext,
  reservationId: string,
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      hotel: true,
      rooms: { include: { room: { include: { category: true } } } },
      guests: { include: { guest: true } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!reservation) throw new Error("Reservation not found");
  assertSameInstitution(ctx, reservation.institutionId);
  return reservation;
}

export async function createReservation(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    hotelId: string;
    arrivalDate: string | Date;
    departureDate: string | Date;
    adults?: number;
    children?: number;
    source?: string;
    internalNotes?: string;
    primaryGuestId?: string;
    roomIds?: string[];
    status?: Extract<ReservationStatus, "DRAFT" | "PENDING" | "CONFIRMED">;
  },
) {
  await getHotel(prisma, ctx, input.hotelId);
  const arrival = toDateOnlyUtc(input.arrivalDate);
  const departure = toDateOnlyUtc(input.departureDate);
  assertValidStayRange(arrival, departure);

  if (input.primaryGuestId) {
    const guest = await prisma.guest.findUnique({ where: { id: input.primaryGuestId } });
    if (!guest || guest.institutionId !== ctx.institutionId) {
      throw new Error("Guest not found");
    }
  }

  const status = input.status ?? "PENDING";
  const roomIds = input.roomIds ?? [];

  return prisma.$transaction(async (tx) => {
    for (const roomId of roomIds) {
      await assertRoomAssignable(tx, {
        roomId,
        hotelId: input.hotelId,
        arrival,
        departure,
      });
    }

    const reservation = await tx.reservation.create({
      data: {
        hotelId: input.hotelId,
        institutionId: ctx.institutionId,
        code: reservationCode(),
        status,
        arrivalDate: arrival,
        departureDate: departure,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        source: input.source ?? null,
        internalNotes: input.internalNotes ?? null,
        rooms: {
          create: roomIds.map((roomId) => ({
            roomId,
            arrivalDate: arrival,
            departureDate: departure,
          })),
        },
        guests: input.primaryGuestId
          ? {
              create: [{ guestId: input.primaryGuestId, isPrimary: true }],
            }
          : undefined,
        events: {
          create: {
            fromStatus: null,
            toStatus: status,
            note: `Created with ${roomIds.length} room(s)`,
            actorUserId: ctx.userId,
          },
        },
      },
      include: {
        rooms: { include: { room: true } },
        guests: { include: { guest: true } },
      },
    });

    if (status === "CONFIRMED" || status === "PENDING") {
      for (const roomId of roomIds) {
        await tx.room.update({
          where: { id: roomId },
          data: { occupancyStatus: "RESERVED" },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "Reservation",
        entityId: reservation.id,
        metadata: { code: reservation.code, status },
      },
    });

    return reservation;
  });
}

export async function confirmReservation(
  prisma: PrismaClient,
  ctx: TenantContext,
  reservationId: string,
) {
  const existing = await getReservation(prisma, ctx, reservationId);
  if (!["DRAFT", "PENDING"].includes(existing.status)) {
    throw new Error("Only draft/pending reservations can be confirmed");
  }

  return prisma.$transaction(async (tx) => {
    for (const rr of existing.rooms) {
      await assertRoomAssignable(tx, {
        roomId: rr.roomId,
        hotelId: existing.hotelId,
        arrival: existing.arrivalDate,
        departure: existing.departureDate,
        excludeReservationId: existing.id,
      });
    }

    const reservation = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CONFIRMED" },
      include: {
        rooms: { include: { room: true } },
        guests: { include: { guest: true } },
      },
    });

    for (const rr of reservation.rooms) {
      await tx.room.update({
        where: { id: rr.roomId },
        data: { occupancyStatus: "RESERVED" },
      });
    }

    await tx.reservationEvent.create({
      data: {
        reservationId,
        fromStatus: existing.status,
        toStatus: "CONFIRMED",
        actorUserId: ctx.userId,
      },
    });

    return reservation;
  });
}

export async function cancelReservation(
  prisma: PrismaClient,
  ctx: TenantContext,
  reservationId: string,
) {
  const existing = await getReservation(prisma, ctx, reservationId);
  if (["CHECKED_OUT", "CANCELLED"].includes(existing.status)) {
    throw new Error("Reservation cannot be cancelled");
  }
  if (existing.status === "CHECKED_IN") {
    throw new Error("Checked-in reservations must be checked out, not cancelled");
  }

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
      include: {
        rooms: { include: { room: true } },
        guests: { include: { guest: true } },
      },
    });

    for (const rr of reservation.rooms) {
      // Only free if no other blocking assignment
      const other = await tx.reservationRoom.count({
        where: {
          roomId: rr.roomId,
          reservationId: { not: reservationId },
          reservation: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } },
        },
      });
      if (other === 0 && rr.room.occupancyStatus === "RESERVED") {
        await tx.room.update({
          where: { id: rr.roomId },
          data: { occupancyStatus: "AVAILABLE" },
        });
      }
    }

    await tx.reservationEvent.create({
      data: {
        reservationId,
        fromStatus: existing.status,
        toStatus: "CANCELLED",
        actorUserId: ctx.userId,
      },
    });

    return reservation;
  });
}

export async function assignRoom(
  prisma: PrismaClient,
  ctx: TenantContext,
  reservationId: string,
  roomId: string,
) {
  const existing = await getReservation(prisma, ctx, reservationId);
  if (["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(existing.status)) {
    throw new Error("Cannot assign room to this reservation");
  }

  return prisma.$transaction(async (tx) => {
    await assertRoomAssignable(tx, {
      roomId,
      hotelId: existing.hotelId,
      arrival: existing.arrivalDate,
      departure: existing.departureDate,
      excludeReservationId: existing.id,
    });

    const link = await tx.reservationRoom.upsert({
      where: {
        reservationId_roomId: { reservationId, roomId },
      },
      create: {
        reservationId,
        roomId,
        arrivalDate: existing.arrivalDate,
        departureDate: existing.departureDate,
      },
      update: {},
      include: { room: true },
    });

    if (["PENDING", "CONFIRMED"].includes(existing.status)) {
      await tx.room.update({
        where: { id: roomId },
        data: { occupancyStatus: "RESERVED" },
      });
    }

    await tx.reservationEvent.create({
      data: {
        reservationId,
        fromStatus: existing.status,
        toStatus: existing.status,
        note: `Room assigned: ${roomId}`,
        actorUserId: ctx.userId,
      },
    });

    return link;
  });
}

export async function calendarReservations(
  prisma: PrismaClient,
  ctx: TenantContext,
  params: { hotelId: string; from: Date; to: Date },
) {
  await getHotel(prisma, ctx, params.hotelId);
  const from = toDateOnlyUtc(params.from);
  const to = toDateOnlyUtc(params.to);

  return prisma.reservation.findMany({
    where: {
      institutionId: ctx.institutionId,
      hotelId: params.hotelId,
      status: { notIn: ["CANCELLED"] },
      arrivalDate: { lt: to },
      departureDate: { gt: from },
    },
    include: {
      rooms: { include: { room: true } },
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
    orderBy: { arrivalDate: "asc" },
  });
}
