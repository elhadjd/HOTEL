import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";

export default async function SigescIntegrationHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("integrations.sigesc");
  const connection = await prisma.aggregateConnection.findUnique({
    where: { institutionId: ctx.institutionId },
  });

  const links = [
    {
      href: "/integrations/customers",
      title: t("nav.centralCustomers"),
      body: "Pesquisar, criar e actualizar clientes financeiros; ligar hóspedes.",
    },
    {
      href: "/integrations/products",
      title: t("nav.centralProducts"),
      body: "Catálogo de produtos/serviços e mapeamento operacional ↔ central.",
    },
    {
      href: "/integrations/invoices",
      title: t("nav.centralInvoices"),
      body: "Criar Cotação/Proforma com idempotência e reconciliação.",
    },
  ];

  return (
    <AppShell title={t("nav.integrations")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Ligação Aggregate multi-empresa. A chave <code>mca_</code> nunca é exposta ao browser.
        </p>
        <Badge tone={connection?.status === "ACTIVE" ? "accent" : "neutral"}>
          {connection?.status ?? "DISCONNECTED"}
        </Badge>
      </div>

      <div className="surface mb-6 p-5">
        <h2 className="text-lg font-semibold text-ink-900">Ligação</h2>
        {connection ? (
          <dl className="font-ui mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-stone-400">Empresa</dt>
              <dd>{connection.ownerCompanyExternalId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-stone-400">Prefixo chave</dt>
              <dd>{connection.keyPrefix ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-stone-400">Scopes</dt>
              <dd>
                {Array.isArray(connection.scopesJson)
                  ? (connection.scopesJson as string[]).join(", ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-stone-400">Modo</dt>
              <dd>{process.env.SIGESC_AGGREGATE_MODE ?? "mock"}</dd>
            </div>
          </dl>
        ) : (
          <p className="font-ui mt-2 text-sm text-amber-800">
            Sem ligação Aggregate. Conclua o onboarding institucional.
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="surface block p-5 transition hover:bg-sand-50">
            <h3 className="font-semibold text-ink-900">{item.title}</h3>
            <p className="font-ui mt-2 text-sm text-stone-500">{item.body}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
