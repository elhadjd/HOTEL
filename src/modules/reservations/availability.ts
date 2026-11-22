import type { Prisma, PrismaClient, ReservationStatus } from "@prisma/client";

/** Statuses that block room assignment for overlapping dates. */
export const BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
];

export type DateRange = { arrival: Date; departure: Date };

export function toDateOnlyUtc(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function assertValidStayRange(arrival: Date, departure: Date): void {
  if (!(arrival instanceof Date) || Number.isNaN(arrival.getTime())) {
    throw new Error("Invalid arrival date");
  }
  if (!(departure instanceof Date) || Number.isNaN(departure.getTime())) {
    throw new Error("Invalid departure date");
  }
  if (departure.getTime() <= arrival.getTime()) {
    throw new Error("Departure must be after arrival");
  }
}

/**
 * Half-open overlap: [arrival, departure) overlaps existing [a, d)
 * when arrival < existing.departure AND departure > existing.arrival
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.arrival < b.departure && a.departure > b.arrival;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function findConflictingReservationRooms(
  db: Db,
  params: {
    roomId: string;
    arrival: Date;
    departure: Date;
    excludeReservationId?: string;
  },
) {
  return db.reservationRoom.findMany({
    where: {
      roomId: params.roomId,
      arrivalDate: { lt: params.departure },
      departureDate: { gt: params.arrival },
      reservation: {
        status: { in: BLOCKING_RESERVATION_STATUSES },
        ...(params.excludeReservationId
          ? { id: { not: params.excludeReservationId } }
          : {}),
      },
    },
    include: {
      reservation: { select: { id: true, code: true, status: true } },
    },
  });
}

export async function assertRoomAssignable(
  db: Db,
  params: {
    roomId: string;
    hotelId: string;
    arrival: Date;
    departure: Date;
    excludeReservationId?: string;
  },
): Promise<void> {
  const room = await db.room.findUnique({ where: { id: params.roomId } });
  if (!room || room.hotelId !== params.hotelId) {
    throw new Error("Room not found for this hotel");
  }
  if (!room.active) throw new Error("Room is inactive");
  if (room.maintenanceStatus === "UNDER_MAINTENANCE" || room.maintenanceStatus === "OUT_OF_SERVICE") {
    throw new Error("Room is unavailable due to maintenance");
  }

  const conflicts = await findConflictingReservationRooms(db, params);
  if (conflicts.length > 0) {
    const codes = conflicts.map((c) => c.reservation.code).join(", ");
    throw new Error(`Room overlap conflict with reservation(s): ${codes}`);
  }
}
