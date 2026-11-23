import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageTenant } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listHousekeepingTasks } from "@/modules/housekeeping/housekeeping-service";
import { HousekeepingClient } from "./housekeeping-client";

export default async function HousekeepingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("housekeeping.read");
  const listed = await listHousekeepingTasks(prisma, ctx);
  return (
    <AppShell title={t("nav.housekeeping")}>
      <HousekeepingClient initialTasks={JSON.parse(JSON.stringify(listed.tasks))} />
    </AppShell>
  );
}
