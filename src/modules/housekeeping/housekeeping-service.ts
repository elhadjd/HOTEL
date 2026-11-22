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
  filters?: { hotelId?: string; status?: HousekeepingTaskStatus; roomId?: string },
) {
  return prisma.housekeepingTask.findMany({
    where: {
      hotel: { institutionId: ctx.institutionId },
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.roomId ? { roomId: filters.roomId } : {}),
    },
    include: {
      room: { select: { id: true, code: true, housekeepingStatus: true, occupancyStatus: true } },
      hotel: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 200,
  });
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
  },
) {
  await assertHotel(prisma, ctx, input.hotelId);
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room || room.hotelId !== input.hotelId) throw new Error("Room not found for hotel");

  const task = await prisma.housekeepingTask.create({
    data: {
      hotelId: input.hotelId,
      roomId: input.roomId,
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
  return prisma.housekeepingTask.update({
    where: { id: taskId },
    data: {
      status: requireInspection ? "INSPECTION_REQUIRED" : "COMPLETED",
      completedAt: new Date(),
    },
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
    return prisma.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: "REJECTED",
        inspectionResult: "REJECTED",
        inspectionNotes: input.notes?.trim() || null,
        inspectedAt: new Date(),
      },
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
    // Room becomes CLEAN only after approved inspection (or completion without inspection)
    await tx.room.update({
      where: { id: task.roomId },
      data: { housekeepingStatus: "CLEAN" },
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
