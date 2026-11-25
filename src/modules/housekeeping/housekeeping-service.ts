import type {
  HousekeepingPriority,
  HousekeepingTaskKind,
  HousekeepingTaskStatus,
  PrismaClient,
} from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";

async function assertHotel(prisma: PrismaClient, ctx: TenantContext, hotelId: string) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);
  return hotel;
}

export async function listHousekeepingTasks(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: {
    hotelId?: string;
    status?: HousekeepingTaskStatus;
    roomId?: string;
    assignedTo?: string;
    floor?: string;
    overdueOnly?: boolean;
    take?: number;
    skip?: number;
  },
) {
  const take = Math.min(Math.max(filters?.take ?? 100, 1), 300);
  const skip = Math.max(filters?.skip ?? 0, 0);
  const openStatuses: HousekeepingTaskStatus[] = [
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "INSPECTION_REQUIRED",
    "REJECTED",
  ];
  const where = {
    hotel: { institutionId: ctx.institutionId },
    ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.roomId ? { roomId: filters.roomId } : {}),
    ...(filters?.assignedTo
      ? { assignedTo: { contains: filters.assignedTo.trim() } }
      : {}),
    ...(filters?.floor
      ? { room: { floor: filters.floor.trim() } }
      : {}),
    ...(filters?.overdueOnly
      ? {
          deadlineAt: { lt: new Date() },
          status: { in: openStatuses },
        }
      : {}),
  };

  const [tasks, total] = await Promise.all([
    prisma.housekeepingTask.findMany({
      where,
      include: {
        room: {
          select: {
            id: true,
            code: true,
            floor: true,
            housekeepingStatus: true,
            occupancyStatus: true,
            maintenanceStatus: true,
          },
        },
        hotel: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take,
      skip,
    }),
    prisma.housekeepingTask.count({ where }),
  ]);

  return { tasks, total, take, skip };
}

export async function createHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    hotelId: string;
    roomId: string;
    kind?: HousekeepingTaskKind;
    priority?: HousekeepingPriority;
    notes?: string;
    deadlineAt?: Date | string;
    assignedTo?: string;
    stayId?: string;
  },
) {
  await assertHotel(prisma, ctx, input.hotelId);
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room || room.hotelId !== input.hotelId) throw new Error("Room not found for hotel");

  const task = await prisma.housekeepingTask.create({
    data: {
      hotelId: input.hotelId,
      roomId: input.roomId,
      stayId: input.stayId ?? null,
      kind: input.kind ?? "CLEANING",
      status: input.assignedTo ? "ASSIGNED" : "PENDING",
      priority: input.priority ?? "NORMAL",
      notes: input.notes?.trim() || null,
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
      assignedTo: input.assignedTo?.trim() || null,
    },
  });

  if (room.housekeepingStatus === "CLEAN") {
    await prisma.room.update({
      where: { id: room.id },
      data: { housekeepingStatus: "DIRTY" },
    });
  }

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "HousekeepingTask",
      entityId: task.id,
      metadata: { roomId: input.roomId, kind: task.kind },
    },
  });

  return task;
}

export async function assignHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  taskId: string,
  assignedTo: string,
) {
  const task = await getOwnedTask(prisma, ctx, taskId);
  return prisma.housekeepingTask.update({
    where: { id: task.id },
    data: {
      assignedTo: assignedTo.trim(),
      status: task.status === "PENDING" ? "ASSIGNED" : task.status,
    },
  });
}

export async function startHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  taskId: string,
) {
  const task = await getOwnedTask(prisma, ctx, taskId);
  if (!["PENDING", "ASSIGNED", "REJECTED"].includes(task.status)) {
    throw new Error(`Cannot start task in status ${task.status}`);
  }
  await prisma.room.update({
    where: { id: task.roomId },
    data: { housekeepingStatus: "CLEANING" },
  });
  return prisma.housekeepingTask.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

const OPEN_HK_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "INSPECTION_REQUIRED",
  "REJECTED",
] as const;

export function deriveHousekeepingRoomStatus(
  remainingOpenTaskStatuses: string[],
): "CLEAN" | "INSPECTING" | "CLEANING" | "DIRTY" {
  if (remainingOpenTaskStatuses.length === 0) return "CLEAN";
  if (remainingOpenTaskStatuses.includes("REJECTED")) return "DIRTY";
  if (remainingOpenTaskStatuses.includes("IN_PROGRESS")) return "CLEANING";
  if (remainingOpenTaskStatuses.includes("INSPECTION_REQUIRED")) return "INSPECTING";
  return "DIRTY";
}

/**
 * Complete cleaning. When requireInspection is true (default), room stays DIRTY/INSPECTING
 * until inspection approval. When false, room becomes CLEAN only if no other open tasks remain.
 * Never marks a dirty room as ready without one of these paths.
 */
export async function completeHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  taskId: string,
  requireInspection = true,
) {
  const task = await getOwnedTask(prisma, ctx, taskId);
  if (task.status !== "IN_PROGRESS" && task.status !== "ASSIGNED") {
    throw new Error(`Cannot complete task in status ${task.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: requireInspection ? "INSPECTION_REQUIRED" : "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (requireInspection) {
      await tx.room.update({
        where: { id: task.roomId },
        data: { housekeepingStatus: "INSPECTING" },
      });
    } else {
      const otherOpen = await tx.housekeepingTask.findMany({
        where: {
          roomId: task.roomId,
          id: { not: taskId },
          status: { in: [...OPEN_HK_STATUSES] },
        },
        select: { status: true },
      });
      await tx.room.update({
        where: { id: task.roomId },
        data: {
          housekeepingStatus: deriveHousekeepingRoomStatus(otherOpen.map((t) => t.status)),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "HousekeepingComplete",
        entityId: taskId,
        metadata: { requireInspection },
      },
    });

    return updated;
  });
}

export async function inspectHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  taskId: string,
  input: { approved: boolean; notes?: string },
) {
  const task = await getOwnedTask(prisma, ctx, taskId);
  if (task.status !== "INSPECTION_REQUIRED" && task.status !== "COMPLETED") {
    throw new Error(`Cannot inspect task in status ${task.status}`);
  }

  if (!input.approved) {
    const reason = input.notes?.trim();
    if (!reason) {
      throw new Error("Rejection reason is required");
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: "REJECTED",
          inspectionResult: "REJECTED",
          inspectionNotes: reason,
          inspectedAt: new Date(),
        },
      });
      await tx.room.update({
        where: { id: task.roomId },
        data: { housekeepingStatus: "DIRTY" },
      });
      await tx.auditLog.create({
        data: {
          institutionId: ctx.institutionId,
          actorUserId: ctx.userId,
          action: "UPDATE",
          entityType: "HousekeepingInspect",
          entityId: taskId,
          metadata: { approved: false },
        },
      });
      return updated;
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        inspectionResult: "APPROVED",
        inspectionNotes: input.notes?.trim() || null,
        inspectedAt: new Date(),
        completedAt: task.completedAt ?? new Date(),
      },
    });
    const otherOpen = await tx.housekeepingTask.findMany({
      where: {
        roomId: task.roomId,
        id: { not: taskId },
        status: { in: [...OPEN_HK_STATUSES] },
      },
      select: { status: true },
    });
    await tx.room.update({
      where: { id: task.roomId },
      data: {
        housekeepingStatus: deriveHousekeepingRoomStatus(otherOpen.map((t) => t.status)),
      },
    });
    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "HousekeepingInspect",
        entityId: taskId,
        metadata: { approved: true },
      },
    });
    return updated;
  });
}

/** Reopen a completed/rejected/cancelled task for another cleaning cycle. */
export async function reopenHousekeepingTask(
  prisma: PrismaClient,
  ctx: TenantContext,
  taskId: string,
  notes?: string,
) {
  const task = await getOwnedTask(prisma, ctx, taskId);
  if (!["COMPLETED", "REJECTED", "CANCELLED", "INSPECTION_REQUIRED"].includes(task.status)) {
    throw new Error(`Cannot reopen task in status ${task.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: task.assignedTo ? "ASSIGNED" : "PENDING",
        completedAt: null,
        inspectedAt: null,
        inspectionResult: null,
        inspectionNotes: notes?.trim() || task.inspectionNotes,
        notes: notes?.trim()
          ? `${task.notes ? `${task.notes}\n` : ""}Reopen: ${notes.trim()}`
          : task.notes,
      },
    });
    await tx.room.update({
      where: { id: task.roomId },
      data: { housekeepingStatus: "DIRTY" },
    });
    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "HousekeepingReopen",
        entityId: taskId,
      },
    });
    return updated;
  });
}

async function getOwnedTask(prisma: PrismaClient, ctx: TenantContext, taskId: string) {
  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { hotel: true },
  });
  if (!task) throw new Error("Housekeeping task not found");
  assertSameInstitution(ctx, task.hotel.institutionId);
  return task;
}

/** Room is ready for new guest only when CLEAN + OK maintenance + not occupied */
export async function isRoomReadyForGuest(prisma: PrismaClient, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.active) return false;
  if (room.occupancyStatus === "OCCUPIED") return false;
  if (room.housekeepingStatus !== "CLEAN") return false;
  if (room.maintenanceStatus !== "OK") return false;
  return true;
}

export async function housekeepingProductivity(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId?: string,
) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const tasks = await prisma.housekeepingTask.findMany({
    where: {
      hotel: { institutionId: ctx.institutionId },
      ...(hotelId ? { hotelId } : {}),
      createdAt: { gte: since },
    },
    select: {
      status: true,
      assignedTo: true,
      startedAt: true,
      completedAt: true,
      deadlineAt: true,
    },
    take: 2000,
  });

  const byAssignee = new Map<
    string,
    { completed: number; pending: number; avgMinutes: number; durations: number[] }
  >();
  for (const t of tasks) {
    const key = t.assignedTo?.trim() || "(unassigned)";
    const row = byAssignee.get(key) ?? {
      completed: 0,
      pending: 0,
      avgMinutes: 0,
      durations: [],
    };
    if (t.status === "COMPLETED") {
      row.completed += 1;
      if (t.startedAt && t.completedAt) {
        row.durations.push((t.completedAt.getTime() - t.startedAt.getTime()) / 60_000);
      }
    } else if (
      ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"].includes(t.status)
    ) {
      row.pending += 1;
    }
    byAssignee.set(key, row);
  }

  return {
    windowDays: 7,
    assignees: [...byAssignee.entries()].map(([name, v]) => ({
      assignedTo: name,
      completed: v.completed,
      pending: v.pending,
      averageMinutes:
        v.durations.length === 0
          ? 0
          : Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length),
    })),
  };
}
