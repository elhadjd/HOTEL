import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listDepartures } from "@/modules/stays/check-out-service";
import { CheckOutClient } from "./check-out-client";

export default async function CheckOutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("stays.checkout");
  const departures = await listDepartures(prisma, ctx);
  return (
    <AppShell title={t("nav.checkOut")}>
      <CheckOutClient initialDepartures={JSON.parse(JSON.stringify(departures))} />
    </AppShell>
  );
}
