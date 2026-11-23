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
    <AppShell title="Equipa">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8.1</Badge>
      </div>
      <StaffClient
        initialMemberships={JSON.parse(JSON.stringify(memberships))}
        roles={roles.map((r) => ({ value: r.code, label: `${r.name} (${r.code})` }))}
      />
    </AppShell>
  );
}
