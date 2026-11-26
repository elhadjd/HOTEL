import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import {
  listInstitutionRoles,
  listStaffMemberships,
} from "@/modules/staff/staff-service";
import { StaffClient } from "./staff-client";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("staff.read");

  const [memberships, roles] = await Promise.all([
    listStaffMemberships(prisma, ctx),
    listInstitutionRoles(prisma, ctx),
  ]);

  return (
    <AppShell title="Equipa e Permissões">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Gira utilizadores, perfis base e permissões individuais por módulo. Todas as alterações
          são aplicadas imediatamente no menu lateral, páginas e endpoints da API.
        </p>
        <Badge tone="accent">Controlo de Acesso (RBAC)</Badge>
      </div>
      <StaffClient
        initialMemberships={JSON.parse(JSON.stringify(memberships))}
        roles={roles}
        canWrite={ctx.permissions.includes("staff.write")}
        callerPermissions={ctx.permissions}
        currentUserId={ctx.userId}
      />
    </AppShell>
  );
}
