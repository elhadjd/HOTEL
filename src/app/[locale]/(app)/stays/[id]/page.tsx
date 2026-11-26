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
import { listStayFolios } from "@/modules/stays/folio-service";
import { StayWorkspaceClient } from "./stay-workspace-client";
import { StayFoliosPanel } from "./stay-folios-panel";

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

  const [
    account,
    eligibleInvoice,
    hotel,
    mappings,
    hkHistory,
    maintEvents,
    hotelRooms,
    linkedGuests,
    folios,
  ] = await Promise.all([
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
    prisma.room.findMany({
      where: { hotelId: stay.hotelId, active: true },
      include: { category: { select: { name: true } } },
      orderBy: [{ floor: "asc" }, { code: "asc" }],
      take: 200,
    }),
    prisma.guest.findMany({
      where: {
        institutionId: ctx.institutionId,
        id: { not: stay.guestId },
        customerMapping: { syncStatus: "LINKED" },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 100,
    }),
    listStayFolios(prisma, ctx, id),
  ]);

  const invoices = await prisma.invoiceIntegration.findMany({
    where: {
      institutionId: ctx.institutionId,
      OR: [{ stayId: stay.id }, { reservationId: stay.reservationId, guestId: stay.guestId }],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const roomCodeById = Object.fromEntries(hotelRooms.map((r) => [r.id, r.code]));
  const availableRooms = hotelRooms
    .filter(
      (r) =>
        r.id !== stay.roomId &&
        r.occupancyStatus !== "OCCUPIED" &&
        r.housekeepingStatus === "CLEAN" &&
        r.maintenanceStatus === "OK",
    )
    .map((r) => ({
      id: r.id,
      code: r.code,
      categoryName: r.category.name,
      capacity: r.capacity,
    }));

  const mappingById = new Map(mappings.map((m) => [m.id, m] as const));
  const unbilledMappedLines = account.lines
    .filter((l) => l.status === "CONFIRMED" && Boolean(l.catalogMappingId))
    .map((l) => {
      const m = l.catalogMappingId ? mappingById.get(l.catalogMappingId) : undefined;
      if (!m) return null;
      return {
        mappingLocalCode: m.localCode,
        label: m.localLabel || l.description,
        quantity: Number(l.quantity),
      };
    })
    .filter((x): x is { mappingLocalCode: string; label: string; quantity: number } => Boolean(x));

  const guestOptionList = linkedGuests.map((g) => ({
    id: g.id,
    name: `${g.firstName} ${g.lastName}`,
    email: g.email,
  }));

  return (
    <AppShell title={`Estadia · ${stay.guest.firstName} ${stay.guest.lastName}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/stays" className="font-ui text-sm text-teal-700 hover:underline">
          ← Estadias
        </Link>
        <Badge tone="accent">Workspace Estadia</Badge>
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
              orderReference: inv.orderReference,
              status: inv.status,
              centralState: inv.centralState,
              centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
              centralRestPayable:
                inv.centralRestPayable != null ? Number(inv.centralRestPayable) : null,
              currency: inv.currency,
              updatedAt: inv.updatedAt,
            })),
          ),
        )}
        canSettleInvoices={ctx.permissions.includes("integrations.invoices.settle")}
        eligibleInvoiceId={eligibleInvoice?.id ?? null}
        unbilledMappedLines={unbilledMappedLines}
        availableRooms={availableRooms}
        roomCodeById={roomCodeById}
        guestOptions={guestOptionList}
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
      <StayFoliosPanel
        stayId={stay.id}
        active={["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status)}
        currency={account.currency}
        primaryGuestName={`${stay.guest.firstName} ${stay.guest.lastName}`}
        folios={folios.map((f) => ({
          id: f.id,
          name: f.name,
          folioType: f.folioType,
          payerGuestId: f.payerGuestId,
          payerGuestName: f.payerGuest
            ? `${f.payerGuest.firstName} ${f.payerGuest.lastName}`
            : null,
          depositAmount: Number(f.depositAmount),
          notes: f.notes,
        }))}
        charges={account.lines.map((l) => ({
          id: l.id,
          folioId: l.folioId ?? null,
          description: l.description,
          kind: l.kind,
          status: l.status,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          hasCatalogMapping: Boolean(l.catalogMappingId),
        }))}
        payerOptions={guestOptionList}
      />
    </AppShell>
  );
}
