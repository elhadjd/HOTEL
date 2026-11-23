import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listArrivals } from "@/modules/stays/stay-service";
import { CheckInClient } from "./check-in-client";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reservationId?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("stays.checkin");
  const arrivals = await listArrivals(prisma, ctx);
  const serialized = JSON.parse(JSON.stringify(arrivals)) as Parameters<
    typeof CheckInClient
  >[0]["initialArrivals"];

  return (
    <AppShell title={t("nav.checkIn")}>
      <CheckInClient
        locale={locale}
        initialArrivals={serialized}
        focusReservationId={query.reservationId}
      />
    </AppShell>
  );
}
