import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listInvoiceIntegrations } from "@/modules/sigesc-integration/invoices/invoice-service";
import { listCatalogMappings } from "@/modules/sigesc-integration/products/products-service";
import { listGuests } from "@/modules/guests/guest-service";
import { InvoicesClient } from "./invoices-client";

export default async function CentralInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("integrations.invoices");

  const [invoices, guests, reservations, mappings] = await Promise.all([
    listInvoiceIntegrations(prisma, ctx),
    listGuests(prisma, ctx, { take: 100 }),
    prisma.reservation.findMany({
      where: { institutionId: ctx.institutionId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, code: true, status: true },
    }),
    listCatalogMappings(prisma, ctx),
  ]);

  return (
    <AppShell title={t("nav.centralInvoices")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Integração de Cotação/Proforma com idempotência por <code>external_id</code>. Totais
          oficiais vêm sempre da resposta central.
        </p>
        <Badge tone="accent">Phase 4</Badge>
      </div>
      <InvoicesClient
        invoices={invoices.map((inv) => ({
          id: inv.id,
          externalId: inv.externalId,
          requestedState: inv.requestedState,
          status: inv.status,
          saleKey: inv.saleKey,
          centralState: inv.centralState,
          centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
          centralSubtotal: inv.centralSubtotal != null ? Number(inv.centralSubtotal) : null,
          centralTax: inv.centralTax != null ? Number(inv.centralTax) : null,
          lastError: inv.lastError,
          reservationId: inv.reservationId,
          guestId: inv.guestId,
        }))}
        guests={guests.map((g) => ({
          id: g.id,
          label: `${g.firstName} ${g.lastName}${g.customerMapping?.syncStatus === "LINKED" ? " · ligado" : " · sem ligação"}`,
        }))}
        reservations={reservations.map((r) => ({
          id: r.id,
          label: `${r.code} (${r.status})`,
        }))}
        mappings={mappings
          .filter((m) => m.active)
          .map((m) => ({ localCode: m.localCode, localLabel: m.localLabel }))}
      />
    </AppShell>
  );
}
