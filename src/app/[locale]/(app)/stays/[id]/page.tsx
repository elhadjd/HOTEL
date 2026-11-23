import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getStay } from "@/modules/stays/stay-service";
import { summarizeStayAccount } from "@/modules/stays/stay-account-service";
import { findEligibleInvoiceForStay } from "@/modules/sigesc-integration/invoices/invoice-service";
import { listCatalogMappings } from "@/modules/sigesc-integration/products/products-service";
import { StayWorkspaceClient } from "./stay-workspace-client";

export default async function StayDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("stays.read");

  let stay;
  try {
    stay = await getStay(prisma, ctx, id);
  } catch {
    notFound();
  }

  const [account, eligibleInvoice, hotel, mappings, hkHistory, maintEvents] = await Promise.all([
    summarizeStayAccount(prisma, ctx, id),
    findEligibleInvoiceForStay(prisma, ctx, id),
    prisma.hotel.findFirst({
      where: { id: stay.hotelId, institutionId: ctx.institutionId },
      select: { id: true, name: true, code: true },
    }),
    listCatalogMappings(prisma, ctx, { activeOnly: true, take: 50 }),
    prisma.housekeepingTask.findMany({
      where: { roomId: stay.roomId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.maintenanceRequest.findMany({
      where: { roomId: stay.roomId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const invoices = await prisma.invoiceIntegration.findMany({
    where: {
      institutionId: ctx.institutionId,
      OR: [{ stayId: stay.id }, { reservationId: stay.reservationId, guestId: stay.guestId }],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <AppShell title={`Estadia · ${stay.guest.firstName} ${stay.guest.lastName}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/stays" className="font-ui text-sm text-teal-700 hover:underline">
          ← Estadias
        </Link>
        <Badge tone="accent">Phase 8</Badge>
      </div>
      <StayWorkspaceClient
        stay={JSON.parse(
          JSON.stringify({
            id: stay.id,
            status: stay.status,
            hotelId: stay.hotelId,
            hotelName: hotel?.name ?? "—",
            roomId: stay.roomId,
            roomCode: stay.room.code,
            categoryName: stay.room.category.name,
            actualArrival: stay.actualArrival,
            expectedDeparture: stay.expectedDeparture,
            actualDeparture: stay.actualDeparture,
            guest: {
              id: stay.guest.id,
              name: `${stay.guest.firstName} ${stay.guest.lastName}`,
              email: stay.guest.email,
              phone: stay.guest.phone,
              customerMapping: stay.guest.customerMapping,
            },
            companions: stay.companions.map((c) => ({
              id: c.id,
              removedAt: c.removedAt,
              guest: {
                id: c.guest.id,
                name: `${c.guest.firstName} ${c.guest.lastName}`,
                linked: c.guest.customerMapping?.syncStatus === "LINKED",
              },
            })),
            reservation: {
              id: stay.reservation.id,
              code: stay.reservation.code,
            },
            roomHistory: stay.roomHistory,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
          }),
        )}
        account={JSON.parse(
          JSON.stringify({
            operationalTotal: account.operationalTotal,
            currency: account.currency,
            lines: account.lines,
            note: account.note,
          }),
        )}
        invoices={JSON.parse(
          JSON.stringify(
            invoices.map((inv) => ({
              id: inv.id,
              externalId: inv.externalId,
              saleKey: inv.saleKey,
              status: inv.status,
              centralState: inv.centralState,
              centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
              currency: inv.currency,
              updatedAt: inv.updatedAt,
            })),
          ),
        )}
        eligibleInvoiceId={eligibleInvoice?.id ?? null}
        mappings={mappings.map((m) => ({
          value: m.localCode,
          label: m.localLabel || m.centralName || m.localCode,
          keywords: [m.localCode, m.centralProductId, m.centralName ?? ""],
          description:
            m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
          unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
        }))}
        housekeeping={JSON.parse(JSON.stringify(hkHistory))}
        maintenance={JSON.parse(JSON.stringify(maintEvents))}
      />
    </AppShell>
  );
}
