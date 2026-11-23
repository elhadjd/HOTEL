import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listActiveStays } from "@/modules/stays/stay-service";
import { StaysClient } from "./stays-client";

export default async function StaysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("stays.read");
  const stays = await listActiveStays(prisma, ctx);
  const rooms = await prisma.room.findMany({
    where: { hotel: { institutionId: ctx.institutionId }, active: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      hotel: { select: { name: true } },
      occupancyStatus: true,
    },
    take: 500,
  });
  const serialized = JSON.parse(JSON.stringify(stays));

  return (
    <AppShell title={t("nav.stays")}>
      <StaysClient
        locale={locale}
        initialStays={serialized}
        rooms={rooms.map((r) => ({
          id: r.id,
          code: r.code,
          hotelName: r.hotel.name,
          occupancyStatus: r.occupancyStatus,
        }))}
      />
    </AppShell>
  );
}
