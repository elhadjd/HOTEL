import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listMaintenanceRequests } from "@/modules/maintenance/maintenance-service";
import { listHotels } from "@/modules/hotels/hotel-service";
import { MaintenanceOpsClient } from "./maintenance-ops-client";

export default async function MaintenanceOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string; roomId?: string; requestId?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("maintenance.read");

  const [hotels, requests] = await Promise.all([
    listHotels(prisma, ctx),
    listMaintenanceRequests(prisma, ctx, {
      hotelId: query.hotelId,
      roomId: query.roomId,
    }),
  ]);

  return (
    <AppShell title="Manutenção — operações">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8</Badge>
      </div>
      <MaintenanceOpsClient
        initialRequests={JSON.parse(JSON.stringify(requests))}
        hotels={hotels.map((h) => ({ value: h.id, label: h.name }))}
        focusRequestId={query.requestId}
      />
    </AppShell>
  );
}
