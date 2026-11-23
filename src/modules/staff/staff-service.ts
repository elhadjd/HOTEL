import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { assertSameInstitution } from "@/modules/tenancy/tenant";

export async function listStaffMemberships(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { q?: string; status?: "ACTIVE" | "INVITED" | "SUSPENDED" },
) {
  const q = filters?.q?.trim();
  return prisma.membership.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { user: { name: { contains: q } } },
              { user: { email: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          isInstitutionAdmin: true,
          lastLoginAt: true,
          invitePending: true,
        },
      },
      role: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
}

export async function updateMembershipRole(
  prisma: PrismaClient,
  ctx: TenantContext,
  membershipId: string,
  roleCode: string,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: true },
  });
  if (!membership || membership.institutionId !== ctx.institutionId) {
    throw new Error("Membership not found");
  }
  assertSameInstitution(ctx, membership.institutionId);

  const role = await prisma.role.findFirst({
    where: { institutionId: ctx.institutionId, code: roleCode },
  });
  if (!role) throw new Error("Role not found");

  // Prevent demoting the last institution admin
  if (membership.user.isInstitutionAdmin && roleCode !== "hotel_admin") {
    const otherAdmins = await prisma.membership.count({
      where: {
        institutionId: ctx.institutionId,
        id: { not: membershipId },
        status: "ACTIVE",
        role: { code: "hotel_admin" },
      },
    });
    if (otherAdmins === 0) {
      throw new Error("Cannot demote the last hotel administrator");
    }
  }

  const updated = await prisma.membership.update({
    where: { id: membershipId },
    data: { roleId: role.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, code: true, name: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "MembershipRole",
      entityId: membershipId,
      metadata: { roleCode },
    },
  });

  return updated;
}

export async function setMembershipStatus(
  prisma: PrismaClient,
  ctx: TenantContext,
  membershipId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: true, role: true },
  });
  if (!membership || membership.institutionId !== ctx.institutionId) {
    throw new Error("Membership not found");
  }
  if (membership.userId === ctx.userId && status !== "ACTIVE") {
    throw new Error("Cannot suspend your own membership");
  }
  if (
    status !== "ACTIVE" &&
    membership.role.code === "hotel_admin" &&
    membership.user.isInstitutionAdmin
  ) {
    const otherAdmins = await prisma.membership.count({
      where: {
        institutionId: ctx.institutionId,
        id: { not: membershipId },
        status: "ACTIVE",
        role: { code: "hotel_admin" },
      },
    });
    if (otherAdmins === 0) {
      throw new Error("Cannot disable the last hotel administrator");
    }
  }

  const updated = await prisma.membership.update({
    where: { id: membershipId },
    data: { status },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, code: true, name: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "MembershipStatus",
      entityId: membershipId,
      metadata: { status },
    },
  });

  return updated;
}

export async function listInstitutionRoles(prisma: PrismaClient, ctx: TenantContext) {
  return prisma.role.findMany({
    where: { institutionId: ctx.institutionId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}
