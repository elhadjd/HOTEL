import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getInstitutionSettings } from "@/modules/settings/settings-service";
import { TenantAccessError } from "@/modules/tenancy/tenant";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  let readOnly = false;
  let ctx;
  try {
    ctx = await requirePageTenant("settings.write");
  } catch (err) {
    if (err instanceof TenantAccessError) {
      ctx = await requirePageTenant("staff.read");
      readOnly = true;
    } else {
      throw err;
    }
  }

  const settings = await getInstitutionSettings(prisma, ctx);

  return (
    <AppShell title="Configurações">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8.1</Badge>
      </div>
      <SettingsClient
        initial={JSON.parse(JSON.stringify(settings))}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
