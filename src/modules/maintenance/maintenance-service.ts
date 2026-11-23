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
  filters?: {
    hotelId?: string;
    status?: MaintenanceRequestStatus;
    roomId?: string;
    assignedTo?: string;
    blocksRoom?: boolean;
    take?: number;
    skip?: number;
  },
) {
  const take = Math.min(Math.max(filters?.take ?? 100, 1), 300);
  const skip = Math.max(filters?.skip ?? 0, 0);
  const where = {
    hotel: { institutionId: ctx.institutionId },
    ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.roomId ? { roomId: filters.roomId } : {}),
    ...(filters?.assignedTo
      ? { assignedTo: { contains: filters.assignedTo.trim() } }
      : {}),
    ...(filters?.blocksRoom != null ? { blocksRoom: filters.blocksRoom } : {}),
  };

  const [requests, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where,
      include: {
        room: {
          select: {
            id: true,
            code: true,
            maintenanceStatus: true,
            occupancyStatus: true,
            housekeepingStatus: true,
          },
        },
        hotel: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take,
      skip,
    }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return { requests, total, take, skip };
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
    materialsNotes?: string;
    materialsCost?: number;
    scheduledAt?: Date | string;
  },
) {
  await assertHotel(prisma, ctx, input.hotelId);
  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room || room.hotelId !== input.hotelId) throw new Error("Room not found for hotel");
  }
  if (input.materialsCost != null && (!Number.isFinite(input.materialsCost) || input.materialsCost < 0)) {
    throw new Error("Materials cost must be a non-negative number");
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
      materialsNotes: input.materialsNotes?.trim() || null,
      materialsCost: input.materialsCost ?? null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    },
  });

  if (input.blocksRoom && input.roomId) {
    // Never evict an active stay — only mark UNDER_MAINTENANCE (blocks readiness)
    await prisma.room.update({
      where: { id: input.roomId },
      data: { maintenanceStatus: "UNDER_MAINTENANCE" },
    });
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
    materialsNotes?: string;
    materialsCost?: number | null;
    interventionNotes?: string;
  },
) {
  const req = await getOwnedRequest(prisma, ctx, requestId);

  if (input.status === "RESOLVED") {
    const resolution = (input.resolution ?? req.resolution)?.trim();
    if (!resolution) {
      throw new Error("Resolution details are required to close a maintenance request");
    }
  }

  if (input.materialsCost != null && (!Number.isFinite(input.materialsCost) || input.materialsCost < 0)) {
    throw new Error("Materials cost must be a non-negative number");
  }

  const data: {
    status: MaintenanceRequestStatus;
    assignedTo?: string | null;
    resolution?: string | null;
    materialsNotes?: string | null;
    materialsCost?: number | null;
    interventionNotes?: string | null;
    startedAt?: Date;
    resolvedAt?: Date | null;
  } = { status: input.status };

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo.trim() || null;
  if (input.resolution !== undefined) data.resolution = input.resolution.trim() || null;
  if (input.materialsNotes !== undefined) {
    data.materialsNotes = input.materialsNotes.trim() || null;
  }
  if (input.materialsCost !== undefined) data.materialsCost = input.materialsCost;
  if (input.interventionNotes !== undefined) {
    data.interventionNotes = input.interventionNotes.trim() || null;
  }
  if (input.status === "IN_PROGRESS" && !req.startedAt) data.startedAt = new Date();
  if (input.status === "RESOLVED" || input.status === "CANCELLED") {
    data.resolvedAt = new Date();
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data,
    });

    // Resolving maintenance never sets housekeeping to CLEAN — only clears maintenance block
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

export async function reopenMaintenanceRequest(
  prisma: PrismaClient,
  ctx: TenantContext,
  requestId: string,
  notes?: string,
) {
  const req = await getOwnedRequest(prisma, ctx, requestId);
  if (!["RESOLVED", "CANCELLED"].includes(req.status)) {
    throw new Error(`Cannot reopen request in status ${req.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: req.assignedTo ? "ASSIGNED" : "OPEN",
        resolvedAt: null,
        reopenedAt: new Date(),
        interventionNotes: notes?.trim()
          ? `${req.interventionNotes ? `${req.interventionNotes}\n` : ""}Reopen: ${notes.trim()}`
          : req.interventionNotes,
      },
    });

    if (req.blocksRoom && req.roomId) {
      await tx.room.update({
        where: { id: req.roomId },
        data: { maintenanceStatus: "UNDER_MAINTENANCE" },
      });
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "MaintenanceReopen",
        entityId: requestId,
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
