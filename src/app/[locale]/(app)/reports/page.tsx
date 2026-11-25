import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { getOperationalReportsBundle } from "@/modules/reporting/operational-reports";
import { listNightAuditRuns } from "@/modules/night-audit/night-audit-service";
import { ReportsClient } from "./reports-client";
import { NightAuditPanel } from "./night-audit-panel";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("reports.read");

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);

  const [hotels, reports, auditRuns] = await Promise.all([
    listHotels(prisma, ctx),
    getOperationalReportsBundle(prisma, ctx, { from, to: new Date() }),
    listNightAuditRuns(prisma, ctx, { limit: 20 }),
  ]);

  const hotelOptions = hotels.map((h) => ({ value: h.id, label: h.name }));

  return (
    <AppShell title="Relatórios">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Night Audit & KPIs</Badge>
      </div>
      <ReportsClient
        hotels={hotelOptions}
        initial={JSON.parse(JSON.stringify(reports))}
      />
      <NightAuditPanel
        hotels={hotelOptions}
        initialRuns={JSON.parse(JSON.stringify(auditRuns))}
      />
    </AppShell>
  );
}
