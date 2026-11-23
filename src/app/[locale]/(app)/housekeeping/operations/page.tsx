import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHousekeepingTasks } from "@/modules/housekeeping/housekeeping-service";
import { listHotels } from "@/modules/hotels/hotel-service";
import { HousekeepingOpsClient } from "./housekeeping-ops-client";

export default async function HousekeepingOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string; roomId?: string; taskId?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("housekeeping.read");

  const [hotels, listed] = await Promise.all([
    listHotels(prisma, ctx),
    listHousekeepingTasks(prisma, ctx, {
      hotelId: query.hotelId,
      roomId: query.roomId,
    }),
  ]);

  return (
    <AppShell title="Governança — operações">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8.1</Badge>
      </div>
      <HousekeepingOpsClient
        initialTasks={JSON.parse(JSON.stringify(listed.tasks))}
        hotels={hotels.map((h) => ({ value: h.id, label: h.name }))}
        focusTaskId={query.taskId}
      />
    </AppShell>
  );
}
