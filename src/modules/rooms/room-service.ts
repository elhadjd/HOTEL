import type { HousekeepingStatus, MaintenanceStatus, OccupancyStatus, PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getHotel } from "@/modules/hotels/hotel-service";

export async function listCategories(prisma: PrismaClient, ctx: TenantContext, hotelId: string) {
  await getHotel(prisma, ctx, hotelId);
  return prisma.roomCategory.findMany({
    where: { hotelId },
    include: { _count: { select: { rooms: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId: string,
  input: {
    name: string;
    code: string;
    description?: string;
    maxOccupancy?: number;
    maxAdults?: number;
    maxChildren?: number;
    bedConfiguration?: string;
    defaultTariff?: number;
  },
) {
  await getHotel(prisma, ctx, hotelId);
  return prisma.roomCategory.create({
    data: {
      hotelId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description ?? null,
      maxOccupancy: input.maxOccupancy ?? 2,
      maxAdults: input.maxAdults ?? 2,
      maxChildren: input.maxChildren ?? 0,
      bedConfiguration: input.bedConfiguration ?? null,
      defaultTariff: input.defaultTariff ?? null,
      active: true,
    },
  });
}

export async function listRooms(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId: string,
  filters?: {
    floor?: string;
    occupancyStatus?: OccupancyStatus;
    housekeepingStatus?: HousekeepingStatus;
    maintenanceStatus?: MaintenanceStatus;
  },
) {
  await getHotel(prisma, ctx, hotelId);
  return prisma.room.findMany({
    where: {
      hotelId,
      ...(filters?.floor ? { floor: filters.floor } : {}),
      ...(filters?.occupancyStatus ? { occupancyStatus: filters.occupancyStatus } : {}),
      ...(filters?.housekeepingStatus
        ? { housekeepingStatus: filters.housekeepingStatus }
        : {}),
      ...(filters?.maintenanceStatus ? { maintenanceStatus: filters.maintenanceStatus } : {}),
    },
    include: { category: true },
    orderBy: [{ floor: "asc" }, { code: "asc" }],
  });
}

export async function createRoom(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId: string,
  input: {
    categoryId: string;
    code: string;
    floor?: string;
    capacity?: number;
    description?: string;
  },
) {
  const hotel = await getHotel(prisma, ctx, hotelId);
  const category = await prisma.roomCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || category.hotelId !== hotel.id) {
    throw new Error("Room category not found for this hotel");
  }

  return prisma.room.create({
    data: {
      hotelId,
      categoryId: input.categoryId,
      code: input.code.trim(),
      floor: input.floor ?? null,
      capacity: input.capacity ?? category.maxOccupancy,
      description: input.description ?? null,
      occupancyStatus: "AVAILABLE",
      housekeepingStatus: "CLEAN",
      maintenanceStatus: "OK",
      active: true,
    },
    include: { category: true },
  });
}

export async function updateRoomStatuses(
  prisma: PrismaClient,
  ctx: TenantContext,
  roomId: string,
  input: Partial<{
    occupancyStatus: OccupancyStatus;
    housekeepingStatus: HousekeepingStatus;
    maintenanceStatus: MaintenanceStatus;
    active: boolean;
    description: string | null;
  }>,
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: true },
  });
  if (!room) throw new Error("Room not found");
  assertSameInstitution(ctx, room.hotel.institutionId);

  return prisma.room.update({
    where: { id: roomId },
    data: {
      occupancyStatus: input.occupancyStatus,
      housekeepingStatus: input.housekeepingStatus,
      maintenanceStatus: input.maintenanceStatus,
      active: input.active,
      description: input.description,
    },
    include: { category: true },
  });
}

export function roomsByFloor<T extends { floor: string | null }>(rooms: T[]) {
  const map = new Map<string, T[]>();
  for (const room of rooms) {
    const key = room.floor ?? "—";
    const list = map.get(key) ?? [];
    list.push(room);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
}
