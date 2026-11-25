import { Prisma, type OccupancyStatus, type PrismaClient, type ReservationStatus } from "@prisma/client";

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

export function daysBetweenUtc(arrival: Date, departure: Date): number {
  const a = toDateOnlyUtc(arrival).getTime();
  const d = toDateOnlyUtc(departure).getTime();
  return Math.max(0, Math.round((d - a) / 86_400_000));
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

/**
 * Pure rule separating current physical occupancy from future bookings:
 * - Active stay on the room => OCCUPIED
 * - Blocking reservation covering today [arrival <= today < departure] => RESERVED
 * - Otherwise (including reservations strictly in the future) => AVAILABLE
 */
export function deriveOccupancyStatus(params: {
  hasActiveStay: boolean;
  hasReservationCoveringToday: boolean;
}): OccupancyStatus {
  if (params.hasActiveStay) return "OCCUPIED";
  if (params.hasReservationCoveringToday) return "RESERVED";
  return "AVAILABLE";
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Acquires InnoDB row-level locks (`SELECT ... FOR UPDATE`) on the target rooms
 * in deterministic sorted order to prevent concurrent overbooking and deadlocks.
 */
export async function lockRoomsForUpdate(
  tx: Prisma.TransactionClient,
  roomIds: string[],
): Promise<void> {
  const uniqueSorted = [...new Set(roomIds.filter(Boolean))].sort();
  if (uniqueSorted.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM rooms WHERE id IN (${Prisma.join(uniqueSorted)}) FOR UPDATE`,
  );
}

/**
 * Synchronizes `Room.occupancyStatus` strictly from live operational truth
 * (active stays and reservations covering today), never clobbering current
 * occupancy with future reservations.
 */
export async function syncRoomOccupancyStatus(
  db: Db,
  roomId: string,
  referenceDate: Date = new Date(),
): Promise<OccupancyStatus> {
  const today = toDateOnlyUtc(referenceDate);

  const [activeStayCount, todayReservationCount] = await Promise.all([
    db.stay.count({
      where: {
        roomId,
        status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
      },
    }),
    db.reservationRoom.count({
      where: {
        roomId,
        arrivalDate: { lte: today },
        departureDate: { gt: today },
        reservation: {
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      },
    }),
  ]);

  const nextStatus = deriveOccupancyStatus({
    hasActiveStay: activeStayCount > 0,
    hasReservationCoveringToday: todayReservationCount > 0,
  });

  await db.room.update({
    where: { id: roomId },
    data: { occupancyStatus: nextStatus },
  });

  return nextStatus;
}

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
    excludeStayId?: string;
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

  // Active stays occupy the room until actual/expected departure
  const stayConflicts = await db.stay.findMany({
    where: {
      roomId: params.roomId,
      status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
      ...(params.excludeStayId
        ? { id: { not: params.excludeStayId } }
        : params.excludeReservationId
          ? { reservationId: { not: params.excludeReservationId } }
          : {}),
      actualArrival: { lt: params.departure },
      OR: [
        { actualDeparture: null, expectedDeparture: { gt: params.arrival } },
        { actualDeparture: { gt: params.arrival } },
      ],
    },
    select: { id: true },
    take: 1,
  });
  if (stayConflicts.length > 0) {
    throw new Error("Room is occupied by an active stay");
  }
}
