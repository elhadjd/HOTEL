import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getFrontDeskSnapshot } from "@/modules/front-desk/front-desk-service";
import { listHotels } from "@/modules/hotels/hotel-service";
import { FrontDeskClient } from "./front-desk-client";

export default async function FrontDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string; date?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  await getTranslations();
  const ctx = await requirePageTenant("dashboard.read");

  const hotels = await listHotels(prisma, ctx);
  const hotelId =
    query.hotelId && hotels.some((h) => h.id === query.hotelId) ? query.hotelId : undefined;
  const onDate = query.date ? new Date(query.date) : undefined;

  const snapshot = await getFrontDeskSnapshot(prisma, ctx, { hotelId, onDate });

  return (
    <AppShell title="Front Desk">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8</Badge>
      </div>
      <FrontDeskClient
        initial={snapshot}
        hotels={hotels.map((h) => ({
          value: h.id,
          label: h.name,
          keywords: [h.code ?? ""],
        }))}
      />
    </AppShell>
  );
}
