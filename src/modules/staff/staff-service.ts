import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { assertSameInstitution } from "@/modules/tenancy/tenant";
import {
  PERMISSIONS,
  resolveEffectivePermissions,
  type PermissionCode,
} from "@/modules/iam/permissions";
import { hashPassword } from "@/modules/auth/password";

const VALID_PERMISSION_CODES = new Set<string>(PERMISSIONS.map((p) => p.code));

export async function ensurePermissionsSeeded(prisma: PrismaClient) {
  await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { code: p.code },
        create: {
          code: p.code,
          module: p.module,
          action: p.action,
          description: p.label,
        },
        update: {
          module: p.module,
          action: p.action,
          description: p.label,
        },
      }),
    ),
  );
}

export async function listStaffMemberships(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { q?: string; status?: "ACTIVE" | "INVITED" | "SUSPENDED" },
) {
  const q = filters?.q?.trim();
  const rows = await prisma.membership.findMany({
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
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          permissions: {
            include: { permission: { select: { code: true } } },
          },
        },
      },
      permissionOverrides: {
        include: { permission: { select: { code: true } } },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  return rows.map((m) => {
    const rolePermissions = m.role.permissions.map((rp) => rp.permission.code);
    const overrides = m.permissionOverrides.map((ov) => ({
      code: ov.permission.code,
      effect: ov.effect,
    }));
    const effectivePermissions = resolveEffectivePermissions(rolePermissions, overrides);

    return {
      id: m.id,
      status: m.status,
      aggregateSuggestedLevel: m.aggregateSuggestedLevel,
      createdAt: m.createdAt,
      user: m.user,
      role: {
        id: m.role.id,
        code: m.role.code,
        name: m.role.name,
      },
      rolePermissions,
      overrides,
      effectivePermissions,
    };
  });
}

export async function createStaffUser(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    name: string;
    email: string;
    password: string;
    roleCode: string;
    mustChangePassword?: boolean;
    grantedPermissions?: string[];
    deniedPermissions?: string[];
  },
) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new Error("Nome obrigatório");
  if (!email) throw new Error("Email obrigatório");
  if (input.password.length < 8) throw new Error("A palavra-passe deve ter pelo menos 8 caracteres");

  const role = await prisma.role.findFirst({
    where: { institutionId: ctx.institutionId, code: input.roleCode },
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
    },
  });
  if (!role) throw new Error("Perfil não encontrado");

  if (role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Apenas um administrador pode atribuir o perfil de administrador");
  }

  const callerPerms = new Set(ctx.permissions);
  for (const rp of role.permissions) {
    if (!callerPerms.has(rp.permission.code)) {
      throw new Error("Não pode atribuir um perfil com permissões que não possui");
    }
  }

  const granted = (input.grantedPermissions ?? []).filter((c) => VALID_PERMISSION_CODES.has(c));
  const denied = (input.deniedPermissions ?? []).filter((c) => VALID_PERMISSION_CODES.has(c));
  for (const code of granted) {
    if (!callerPerms.has(code)) {
      throw new Error(`Não pode conceder a permissão "${code}" porque a sua conta não a possui`);
    }
  }

  await ensurePermissionsSeeded(prisma);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        institutionId_userId: { institutionId: ctx.institutionId, userId: existingUser.id },
      },
    });
    if (existingMembership) {
      throw new Error("Já existe um utilizador com este email nesta conta");
    }
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          active: true,
          mustChangePassword: input.mustChangePassword ?? true,
          isInstitutionAdmin: role.code === "hotel_admin",
        },
      }));

    const membership = await tx.membership.create({
      data: {
        institutionId: ctx.institutionId,
        userId: user.id,
        roleId: role.id,
        status: "ACTIVE",
      },
    });

    const rolePermSet = new Set(role.permissions.map((rp) => rp.permission.code));
    const overrideEntries: Array<{ code: string; effect: "GRANT" | "DENY" }> = [];
    for (const code of granted) {
      if (!rolePermSet.has(code)) overrideEntries.push({ code, effect: "GRANT" });
    }
    for (const code of denied) {
      if (rolePermSet.has(code)) overrideEntries.push({ code, effect: "DENY" });
    }

    if (overrideEntries.length > 0) {
      const perms = await tx.permission.findMany({
        where: { code: { in: overrideEntries.map((o) => o.code) } },
        select: { id: true, code: true },
      });
      const idByCode = new Map(perms.map((p) => [p.code, p.id]));
      for (const entry of overrideEntries) {
        const permId = idByCode.get(entry.code);
        if (!permId) continue;
        await tx.membershipPermissionOverride.create({
          data: {
            membershipId: membership.id,
            permissionId: permId,
            effect: entry.effect,
            updatedByUserId: ctx.userId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "StaffUser",
        entityId: membership.id,
        metadata: {
          email,
          roleCode: role.code,
          overridesCount: overrideEntries.length,
        },
      },
    });

    return membership;
  });
}

export async function updateMembershipPermissions(
  prisma: PrismaClient,
  ctx: TenantContext,
  membershipId: string,
  desiredPermissions: string[],
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      user: true,
      role: {
        include: {
          permissions: { include: { permission: { select: { code: true } } } },
        },
      },
    },
  });
  if (!membership || membership.institutionId !== ctx.institutionId) {
    throw new Error("Membership not found");
  }
  assertSameInstitution(ctx, membership.institutionId);

  if (membership.role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Apenas um administrador pode alterar permissões de outro administrador");
  }

  const desiredSet = new Set(desiredPermissions.filter((c) => VALID_PERMISSION_CODES.has(c)));
  const roleSet = new Set(membership.role.permissions.map((rp) => rp.permission.code));
  const callerSet = new Set(ctx.permissions);

  // Prevent locking yourself out of staff management or removing staff.write from the last active admin
  if (membership.userId === ctx.userId && !desiredSet.has("staff.write")) {
    throw new Error("Não pode remover a permissão staff.write da sua própria conta");
  }

  // Prevent privilege escalation: cannot grant a permission you don't hold
  for (const code of desiredSet) {
    if (!callerSet.has(code)) {
      throw new Error(`Não pode atribuir a permissão "${code}" porque não a possui`);
    }
  }

  // Compute minimal diff against role baseline
  const overridesToWrite: Array<{ code: string; effect: "GRANT" | "DENY" }> = [];
  for (const perm of PERMISSIONS) {
    const inRole = roleSet.has(perm.code);
    const inDesired = desiredSet.has(perm.code);
    if (!inRole && inDesired) {
      overridesToWrite.push({ code: perm.code, effect: "GRANT" });
    } else if (inRole && !inDesired) {
      overridesToWrite.push({ code: perm.code, effect: "DENY" });
    }
  }

  await ensurePermissionsSeeded(prisma);

  return prisma.$transaction(async (tx) => {
    await tx.membershipPermissionOverride.deleteMany({
      where: { membershipId },
    });

    if (overridesToWrite.length > 0) {
      const perms = await tx.permission.findMany({
        where: { code: { in: overridesToWrite.map((o) => o.code) } },
        select: { id: true, code: true },
      });
      const idByCode = new Map(perms.map((p) => [p.code, p.id]));
      for (const ov of overridesToWrite) {
        const permId = idByCode.get(ov.code);
        if (!permId) continue;
        await tx.membershipPermissionOverride.create({
          data: {
            membershipId,
            permissionId: permId,
            effect: ov.effect,
            updatedByUserId: ctx.userId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "MembershipPermissions",
        entityId: membershipId,
        metadata: {
          roleCode: membership.role.code,
          grants: overridesToWrite.filter((o) => o.effect === "GRANT").map((o) => o.code),
          denies: overridesToWrite.filter((o) => o.effect === "DENY").map((o) => o.code),
        },
      },
    });

    return {
      membershipId,
      rolePermissions: [...roleSet],
      overrides: overridesToWrite,
      effectivePermissions: resolveEffectivePermissions(roleSet, overridesToWrite),
    };
  });
}

export async function resetMembershipPermissions(
  prisma: PrismaClient,
  ctx: TenantContext,
  membershipId: string,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: { select: { code: true } } } },
        },
      },
    },
  });
  if (!membership || membership.institutionId !== ctx.institutionId) {
    throw new Error("Membership not found");
  }
  assertSameInstitution(ctx, membership.institutionId);

  if (membership.role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Apenas um administrador pode repor permissões de outro administrador");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membershipPermissionOverride.deleteMany({ where: { membershipId } });
    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "MembershipPermissionsReset",
        entityId: membershipId,
        metadata: { roleCode: membership.role.code },
      },
    });
  });

  const rolePermissions = membership.role.permissions.map((rp) => rp.permission.code);
  return {
    membershipId,
    rolePermissions,
    overrides: [] as Array<{ code: PermissionCode; effect: "GRANT" | "DENY" }>,
    effectivePermissions: [...rolePermissions].sort(),
  };
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

  if (role.code === "hotel_admin" && ctx.roleCode !== "hotel_admin") {
    throw new Error("Insufficient privileges to assign hotel_admin role");
  }
  const callerPerms = new Set(ctx.permissions);
  for (const rp of role.permissions) {
    if (!callerPerms.has(rp.permission.code)) {
      throw new Error("Cannot assign a role with permissions you do not hold");
    }
  }

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
  const roles = await prisma.role.findMany({
    where: { institutionId: ctx.institutionId },
    select: {
      id: true,
      code: true,
      name: true,
      permissions: {
        include: { permission: { select: { code: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    permissions: r.permissions.map((rp) => rp.permission.code),
  }));
}
