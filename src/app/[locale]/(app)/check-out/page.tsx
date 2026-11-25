import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listDepartures } from "@/modules/stays/check-out-service";
import { CheckOutClient } from "./check-out-client";

export default async function CheckOutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stayId?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("stays.checkout");
  const departures = await listDepartures(prisma, ctx, {
    includeOverdue: true,
    focusStayId: query.stayId,
  });
  return (
    <AppShell title={t("nav.checkOut")}>
      <CheckOutClient
        initialDepartures={JSON.parse(JSON.stringify(departures))}
        focusStayId={query.stayId}
      />
    </AppShell>
  );
}
