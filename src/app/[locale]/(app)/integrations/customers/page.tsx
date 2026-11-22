import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { searchCentralCustomers } from "@/modules/sigesc-integration/customers/customers-service";
import { CustomersClient } from "./customers-client";

export default async function CentralCustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("integrations.customers");

  let initial: Awaited<ReturnType<typeof searchCentralCustomers>> | null = null;
  let loadError: string | null = null;
  const associations: Record<string, string> = {};

  try {
    initial = await searchCentralCustomers(prisma, ctx, { per_page: 25 });
    const mappings = await prisma.guestCustomerMapping.findMany({
      where: {
        institutionId: ctx.institutionId,
        syncStatus: "LINKED",
        externalCustomerId: { not: null },
      },
      select: { externalCustomerId: true, guestId: true },
    });
    for (const m of mappings) {
      if (m.externalCustomerId) associations[m.externalCustomerId] = m.guestId;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Falha ao carregar clientes";
  }

  return (
    <AppShell title={t("nav.centralCustomers")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Clientes financeiros oficiais no SIGESC. Um cliente pode existir sem hóspede; a
          conversão em hóspede é uma acção explícita (individual ou em lote).
        </p>
        <Badge tone="accent">Phase 5</Badge>
      </div>
      {loadError ? (
        <div className="surface p-5">
          <p className="font-ui text-sm text-amber-800">{loadError}</p>
        </div>
      ) : (
        <CustomersClient
          initial={initial?.data ?? []}
          pagination={initial?.meta?.pagination}
          associations={associations}
        />
      )}
    </AppShell>
  );
}
