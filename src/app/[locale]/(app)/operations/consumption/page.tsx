import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listActiveStays } from "@/modules/stays/stay-service";
import { listCatalogMappings } from "@/modules/sigesc-integration/products/products-service";
import { ConsumptionClient } from "./consumption-client";

export default async function ConsumptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stayId?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("stays.manage");

  const [stays, mappings] = await Promise.all([
    listActiveStays(prisma, ctx),
    listCatalogMappings(prisma, ctx, { activeOnly: true, take: 50 }),
  ]);

  return (
    <AppShell title="Consumo operacional">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8</Badge>
      </div>
      <ConsumptionClient
        initialStayId={query.stayId}
        stays={stays.map((s) => ({
          value: s.id,
          label: `${s.guest.firstName} ${s.guest.lastName} · ${s.room.code}`,
          keywords: [s.reservation.code, s.room.code, s.id],
          description: s.reservation.code,
        }))}
        mappings={mappings.map((m) => ({
          value: m.localCode,
          label: m.localLabel || m.centralName || m.localCode,
          keywords: [m.localCode, m.centralProductId, m.centralName ?? ""],
          description:
            m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
          unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
        }))}
      />
    </AppShell>
  );
}
