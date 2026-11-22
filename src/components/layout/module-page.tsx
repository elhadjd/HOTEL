import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export async function ModulePage({
  locale,
  navKey,
  status = "foundation",
}: {
  locale: string;
  navKey: string;
  status?: "foundation" | "planned";
}) {
  setRequestLocale(locale);
  const t = await getTranslations();
  const title = t(navKey);

  return (
    <AppShell title={title}>
      <div className="mb-4">
        <Badge tone={status === "foundation" ? "accent" : "warning"}>
          {status === "foundation" ? "Phase 1 shell" : "Planned module"}
        </Badge>
      </div>
      <EmptyState title={title} description={t("common.comingSoon")} />
    </AppShell>
  );
}
