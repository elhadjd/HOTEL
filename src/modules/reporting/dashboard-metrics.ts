import { prisma } from "@/server/db";

export type DashboardMetrics = {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  todaysArrivals: number;
  todaysDepartures: number;
  activeReservations: number;
  upcomingReservations: number;
  occupancyPercent: number;
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDashboardMetrics(institutionId?: string): Promise<DashboardMetrics> {
  const hotelFilter = institutionId
    ? { hotel: { institutionId } }
    : undefined;

  const today = startOfTodayUtc();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [
    totalRooms,
    availableRooms,
    occupiedRooms,
    cleaningRooms,
    maintenanceRooms,
    todaysArrivals,
    todaysDepartures,
    activeReservations,
    upcomingReservations,
  ] = await Promise.all([
    prisma.room.count({ where: { active: true, ...(hotelFilter ?? {}) } }),
    prisma.room.count({
      where: { active: true, occupancyStatus: "AVAILABLE", ...(hotelFilter ?? {}) },
    }),
    prisma.room.count({
      where: { active: true, occupancyStatus: "OCCUPIED", ...(hotelFilter ?? {}) },
    }),
    prisma.room.count({
      where: {
        active: true,
        housekeepingStatus: { in: ["DIRTY", "CLEANING"] },
        ...(hotelFilter ?? {}),
      },
    }),
    prisma.room.count({
      where: {
        active: true,
        maintenanceStatus: { in: ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"] },
        ...(hotelFilter ?? {}),
      },
    }),
    prisma.reservation.count({
      where: {
        arrivalDate: { gte: today, lt: tomorrow },
        status: { in: ["CONFIRMED", "PENDING"] },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.reservation.count({
      where: {
        departureDate: { gte: today, lt: tomorrow },
        status: { in: ["CHECKED_IN", "CONFIRMED"] },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.reservation.count({
      where: {
        status: { in: ["CONFIRMED", "CHECKED_IN", "PENDING"] },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.reservation.count({
      where: {
        arrivalDate: { gt: tomorrow },
        status: { in: ["CONFIRMED", "PENDING"] },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
  ]);

  const occupancyPercent =
    totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 1000) / 10;

  return {
    totalRooms,
    availableRooms,
    occupiedRooms,
    cleaningRooms,
    maintenanceRooms,
    todaysArrivals,
    todaysDepartures,
    activeReservations,
    upcomingReservations,
    occupancyPercent,
  };
}
