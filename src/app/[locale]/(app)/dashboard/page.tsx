import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardMetrics } from "@/modules/reporting/dashboard-metrics";
import { requirePageTenant } from "@/server/page-auth";

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="surface animate-fade-up p-5">
      <p className="font-ui text-xs uppercase tracking-[0.16em] text-stone-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="font-ui mt-2 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("dashboard.read");

  let metrics;
  let dbUnavailable = false;
  try {
    metrics = await getDashboardMetrics(ctx.institutionId);
  } catch {
    dbUnavailable = true;
    metrics = {
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      cleaningRooms: 0,
      maintenanceRooms: 0,
      todaysArrivals: 0,
      todaysDepartures: 0,
      activeReservations: 0,
      upcomingReservations: 0,
      occupancyPercent: 0,
    };
  }

  return (
    <AppShell title={t("dashboard.title")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui max-w-2xl text-sm text-stone-500">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/front-desk"
            className="font-ui text-sm text-teal-700 hover:underline"
          >
            Abrir Front Desk →
          </Link>
          <Badge tone="accent">Phase 8</Badge>
        </div>
      </div>

      {dbUnavailable ? (
        <EmptyState
          className="mb-6"
          title="PostgreSQL ainda não está ligado"
          description="Arranque `docker compose up -d` e execute as migrações Prisma. Os indicadores abaixo mostram zeros até existirem registos."
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("dashboard.totalRooms")} value={metrics.totalRooms} />
        <Metric label={t("dashboard.available")} value={metrics.availableRooms} />
        <Metric label={t("dashboard.occupied")} value={metrics.occupiedRooms} />
        <Metric label={t("dashboard.cleaning")} value={metrics.cleaningRooms} />
        <Metric label={t("dashboard.maintenance")} value={metrics.maintenanceRooms} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("dashboard.arrivals")} value={metrics.todaysArrivals} />
        <Metric label={t("dashboard.departures")} value={metrics.todaysDepartures} />
        <Metric label={t("dashboard.activeReservations")} value={metrics.activeReservations} />
        <Metric label={t("dashboard.upcoming")} value={metrics.upcomingReservations} />
        <Metric
          label={t("dashboard.occupancy")}
          value={`${metrics.occupancyPercent}%`}
          hint="Calculado a partir de quartos OCCUPIED / total"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <EmptyState
          title={t("dashboard.alerts")}
          description={
            metrics.cleaningRooms + metrics.maintenanceRooms === 0
              ? t("common.empty")
              : `${metrics.cleaningRooms} limpeza · ${metrics.maintenanceRooms} manutenção`
          }
        />
        <EmptyState
          title={t("dashboard.activity")}
          description={t("common.comingSoon")}
        />
      </div>
    </AppShell>
  );
}
