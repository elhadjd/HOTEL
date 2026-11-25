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
    include: { user: true, role: true },
  });
  if (!membership || membership.institutionId !== ctx.institutionId) {
    throw new Error("Membership not found");
  }
  assertSameInstitution(ctx, membership.institutionId);

  if (membership.userId === ctx.userId) {
    throw new Error("Cannot change your own role");
  }

  if (membership.role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Only a hotel administrator can modify another administrator's role");
  }

  const role = await prisma.role.findFirst({
    where: { institutionId: ctx.institutionId, code: roleCode },
    include: {
      permissions: {
        include: { permission: { select: { code: true } } },
      },
    },
  });
  if (!role) throw new Error("Role not found");

  // Prevent privilege escalation: caller cannot assign hotel_admin unless already
  // hotel_admin, and cannot assign any role whose permissions exceed their own.
  if (role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Insufficient privileges to assign hotel_admin role");
  }
  const callerPerms = new Set(ctx.permissions);
  for (const rp of role.permissions) {
    if (!callerPerms.has(rp.permission.code)) {
      throw new Error("Cannot assign a role with permissions you do not hold");
    }
  }

  // Prevent demoting the last active hotel administrator
  if (membership.role.code === "hotel_admin" && roleCode !== "hotel_admin") {
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: { roleId: role.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, code: true, name: true } },
      },
    });

    await tx.user.update({
      where: { id: membership.userId },
      data: { sessionVersion: { increment: 1 } },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "MembershipRole",
        entityId: membershipId,
        metadata: { previousRoleCode: membership.role.code, roleCode },
      },
    });

    return updated;
  });
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
  if (membership.role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Only a hotel administrator can change an administrator's status");
  }
  if (status !== "ACTIVE" && membership.role.code === "hotel_admin") {
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: { status },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, code: true, name: true } },
      },
    });

    if (status !== "ACTIVE") {
      await tx.user.update({
        where: { id: membership.userId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: membership.userId } });
    }

    await tx.auditLog.create({
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
  });
}

export async function listInstitutionRoles(prisma: PrismaClient, ctx: TenantContext) {
  return prisma.role.findMany({
    where: { institutionId: ctx.institutionId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}
