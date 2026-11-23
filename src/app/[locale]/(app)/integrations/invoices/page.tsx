import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import {
  listInvoiceIntegrations,
  summarizeInvoiceLines,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { listCatalogMappings } from "@/modules/sigesc-integration/products/products-service";
import { listGuests } from "@/modules/guests/guest-service";
import { InvoicesClient } from "./invoices-client";

export default async function CentralInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stayId?: string; guestId?: string; hotelId?: string }>;
}) {
  const { locale } = await params;
  const prefill = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("integrations.invoices");

  const [invoicePage, guests, reservations, stays, hotels, mappings] = await Promise.all([
    listInvoiceIntegrations(prisma, ctx, { take: 20, skip: 0 }),
    listGuests(prisma, ctx, { take: 50 }),
    prisma.reservation.findMany({
      where: { institutionId: ctx.institutionId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, code: true, status: true },
    }),
    prisma.stay.findMany({
      where: { institutionId: ctx.institutionId, status: { in: ["ACTIVE", "CHECKOUT_PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        guest: { select: { firstName: true, lastName: true } },
        room: { select: { code: true } },
        reservation: { select: { code: true } },
      },
    }),
    prisma.hotel.findMany({
      where: { institutionId: ctx.institutionId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    listCatalogMappings(prisma, ctx, { activeOnly: true, take: 50 }),
  ]);

  const guestById = new Map(
    guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`] as const),
  );
  const hotelById = new Map(hotels.map((h) => [h.id, h.name] as const));

  return (
    <AppShell title={t("nav.centralInvoices")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Workspace de cotações e proformas com pesquisa, filtros e edição contínua enquanto o
          documento central permanecer em Cotação/Proforma.
        </p>
        <Badge tone="accent">Phase 7</Badge>
      </div>
      <InvoicesClient
        total={invoicePage.total}
        take={invoicePage.take}
        skip={invoicePage.skip}
        prefill={prefill}
        invoices={invoicePage.rows.map((inv) => ({
          id: inv.id,
          externalId: inv.externalId,
          requestedState: inv.requestedState,
          status: inv.status,
          saleKey: inv.saleKey,
          centralState: inv.centralState,
          centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
          centralSubtotal: inv.centralSubtotal != null ? Number(inv.centralSubtotal) : null,
          centralTax: inv.centralTax != null ? Number(inv.centralTax) : null,
          currency: inv.currency,
          lastError: inv.lastError,
          reservationId: inv.reservationId,
          stayId: inv.stayId,
          guestId: inv.guestId,
          hotelId: inv.hotelId,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          summary: summarizeInvoiceLines(inv.linesJson),
          guestLabel: inv.guestId ? guestById.get(inv.guestId) ?? inv.guestId : null,
          hotelLabel: inv.hotelId ? hotelById.get(inv.hotelId) ?? inv.hotelId : null,
        }))}
        guests={guests.map((g) => ({
          value: g.id,
          label: `${g.firstName} ${g.lastName}`,
          keywords: [g.email ?? "", g.phone ?? "", g.customerMapping?.externalCustomerId ?? ""],
          description:
            g.customerMapping?.syncStatus === "LINKED" ? "Cliente SIGESC ligado" : "Sem ligação",
        }))}
        reservations={reservations.map((r) => ({
          value: r.id,
          label: r.code,
          keywords: [r.status],
          description: r.status,
        }))}
        stays={stays.map((s) => ({
          value: s.id,
          label: `${s.reservation.code} · ${s.guest.firstName} ${s.guest.lastName}`,
          keywords: [s.room.code, s.id],
          description: `Quarto ${s.room.code}`,
        }))}
        hotels={hotels.map((h) => ({
          value: h.id,
          label: h.name,
          keywords: [h.code ?? ""],
        }))}
        mappings={mappings
          .filter((m) => m.active)
          .map((m) => ({
            value: m.localCode,
            label: m.localLabel || m.centralName || m.localCode,
            keywords: [m.localCode, m.centralProductId, m.centralName ?? ""],
            description: m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
            unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
          }))}
      />
    </AppShell>
  );
}
