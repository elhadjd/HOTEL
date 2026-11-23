import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { listRatePlans } from "@/modules/rates/rates-service";
import { RatesClient } from "./rates-client";

export default async function RatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("rates.read");

  const [hotels, listed, categories] = await Promise.all([
    listHotels(prisma, ctx),
    listRatePlans(prisma, ctx, { take: 100 }),
    prisma.roomCategory.findMany({
      where: { hotel: { institutionId: ctx.institutionId }, active: true },
      select: { id: true, name: true, code: true, hotelId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AppShell title="Tarifas">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8.1</Badge>
      </div>
      <RatesClient
        initialPlans={JSON.parse(JSON.stringify(listed.rows))}
        hotels={hotels.map((h) => ({ value: h.id, label: h.name }))}
        categories={categories.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.code})`,
          hotelId: c.hotelId,
        }))}
      />
    </AppShell>
  );
}
