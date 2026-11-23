import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { getOperationalReportsBundle } from "@/modules/reporting/operational-reports";
import { ReportsClient } from "./reports-client";

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

  const [hotels, reports] = await Promise.all([
    listHotels(prisma, ctx),
    getOperationalReportsBundle(prisma, ctx, { from, to: new Date() }),
  ]);

  return (
    <AppShell title="Relatórios">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8.1</Badge>
      </div>
      <ReportsClient
        hotels={hotels.map((h) => ({ value: h.id, label: h.name }))}
        initial={JSON.parse(JSON.stringify(reports))}
      />
    </AppShell>
  );
}
