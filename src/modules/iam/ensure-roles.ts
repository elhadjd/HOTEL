import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS, SYSTEM_ROLES } from "./permissions";

export async function ensureGlobalPermissions(prisma: PrismaClient): Promise<void> {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      create: {
        code: perm.code,
        module: perm.module,
        action: perm.action,
      },
      update: {
        module: perm.module,
        action: perm.action,
      },
    });
  }
}

export async function ensureInstitutionRoles(
  prisma: PrismaClient,
  institutionId: string,
): Promise<Record<string, string>> {
  await ensureGlobalPermissions(prisma);
  const roleIds: Record<string, string> = {};

  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        institutionId_code: { institutionId, code: roleDef.code },
      },
      create: {
        institutionId,
        code: roleDef.code,
        name: roleDef.name,
        system: true,
      },
      update: {
        name: roleDef.name,
        system: true,
      },
    });
    roleIds[roleDef.code] = role.id;

    for (const code of roleDef.permissions) {
      const permission = await prisma.permission.findUnique({ where: { code } });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  return roleIds;
}
