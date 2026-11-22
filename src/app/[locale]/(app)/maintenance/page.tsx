import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listMaintenanceRequests } from "@/modules/maintenance/maintenance-service";
import { MaintenanceClient } from "./maintenance-client";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("maintenance.read");
  const requests = await listMaintenanceRequests(prisma, ctx);
  return (
    <AppShell title={t("nav.maintenance")}>
      <MaintenanceClient initialRequests={JSON.parse(JSON.stringify(requests))} />
    </AppShell>
  );
}
