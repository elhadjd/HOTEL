import type {
  MaintenancePriority,
  MaintenanceRequestStatus,
  PrismaClient,
} from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";

async function assertHotel(prisma: PrismaClient, ctx: TenantContext, hotelId: string) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);
  return hotel;
}

export async function listMaintenanceRequests(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { hotelId?: string; status?: MaintenanceRequestStatus; roomId?: string },
) {
  return prisma.maintenanceRequest.findMany({
    where: {
      hotel: { institutionId: ctx.institutionId },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.roomId ? { roomId: filters.roomId } : {}),
    },
    include: {
      room: { select: { id: true, code: true, maintenanceStatus: true, occupancyStatus: true } },
      hotel: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 200,
  });
}

export async function createMaintenanceRequest(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    hotelId: string;
    roomId?: string;
    title: string;
    description?: string;
    category?: string;
    priority?: MaintenancePriority;
    blocksRoom?: boolean;
    assignedTo?: string;
  },
) {
  await assertHotel(prisma, ctx, input.hotelId);
  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room || room.hotelId !== input.hotelId) throw new Error("Room not found for hotel");
  }

  const req = await prisma.maintenanceRequest.create({
    data: {
      hotelId: input.hotelId,
      roomId: input.roomId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      priority: input.priority ?? "NORMAL",
      status: input.assignedTo ? "ASSIGNED" : "OPEN",
      assignedTo: input.assignedTo?.trim() || null,
      blocksRoom: Boolean(input.blocksRoom),
    },
  });

  if (input.blocksRoom && input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    // Never evict an active stay — only block future assignment when vacant or mark UNDER_MAINTENANCE
    if (room && room.occupancyStatus !== "OCCUPIED") {
      await prisma.room.update({
        where: { id: input.roomId },
        data: { maintenanceStatus: "UNDER_MAINTENANCE" },
      });
    } else if (room) {
      await prisma.room.update({
        where: { id: input.roomId },
        data: { maintenanceStatus: "UNDER_MAINTENANCE" },
      });
      // Occupied stay continues; assignment/check-in of others blocked via maintenanceStatus
    }
  }

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "MaintenanceRequest",
      entityId: req.id,
      metadata: { roomId: input.roomId, blocksRoom: Boolean(input.blocksRoom) },
    },
  });

  return req;
}

export async function updateMaintenanceStatus(
  prisma: PrismaClient,
  ctx: TenantContext,
  requestId: string,
  input: {
    status: MaintenanceRequestStatus;
    assignedTo?: string;
    resolution?: string;
  },
) {
  const req = await getOwnedRequest(prisma, ctx, requestId);
  const data: {
    status: MaintenanceRequestStatus;
    assignedTo?: string | null;
    resolution?: string | null;
    startedAt?: Date;
    resolvedAt?: Date | null;
  } = { status: input.status };

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo.trim() || null;
  if (input.resolution !== undefined) data.resolution = input.resolution.trim() || null;
  if (input.status === "IN_PROGRESS" && !req.startedAt) data.startedAt = new Date();
  if (input.status === "RESOLVED") data.resolvedAt = new Date();
  if (input.status === "CANCELLED") data.resolvedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data,
    });

    if (
      (input.status === "RESOLVED" || input.status === "CANCELLED") &&
      req.roomId &&
      req.blocksRoom
    ) {
      const otherBlocking = await tx.maintenanceRequest.count({
        where: {
          roomId: req.roomId,
          id: { not: requestId },
          blocksRoom: true,
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
        },
      });
      if (otherBlocking === 0) {
        await tx.room.update({
          where: { id: req.roomId },
          data: { maintenanceStatus: "OK" },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "MaintenanceRequest",
        entityId: requestId,
        metadata: { status: input.status },
      },
    });

    return updated;
  });
}

async function getOwnedRequest(prisma: PrismaClient, ctx: TenantContext, id: string) {
  const req = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: { hotel: true },
  });
  if (!req) throw new Error("Maintenance request not found");
  assertSameInstitution(ctx, req.hotel.institutionId);
  return req;
}
