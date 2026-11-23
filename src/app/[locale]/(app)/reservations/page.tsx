import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { listReservations } from "@/modules/reservations/reservation-service";
import { CreateReservationForm } from "./create-reservation-form";
import { ReservationActions } from "./reservation-actions";

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string }>;
}) {
  const { locale } = await params;
  const { hotelId: hotelIdParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("reservations.read");
  const hotels = await listHotels(prisma, ctx);
  const hotelId = hotelIdParam ?? hotels[0]?.id;

  const reservations = await listReservations(prisma, ctx, {
    hotelId: hotelId || undefined,
  });

  const rooms = hotelId
    ? await prisma.room.findMany({
        where: { hotelId, active: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true },
      })
    : [];
  const guests = await prisma.guest.findMany({
    where: { institutionId: ctx.institutionId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 100,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });

  return (
    <AppShell title={t("nav.reservations")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-sm text-stone-500">
            Validação transaccional de disponibilidade — conflitos de quarto bloqueados.
          </p>
          <div className="font-ui mt-3 flex flex-wrap gap-2 text-sm">
            {hotels.map((h) => (
              <a
                key={h.id}
                href={`?hotelId=${h.id}`}
                className={
                  h.id === hotelId
                    ? "rounded-md bg-ink-900 px-3 py-1.5 text-white"
                    : "rounded-md border border-sand-200 bg-white px-3 py-1.5 text-stone-600"
                }
              >
                {h.name}
              </a>
            ))}
          </div>
        </div>
        <Badge tone="accent">Phase 3</Badge>
      </div>

      {!hotelId ? (
        <EmptyState title={t("nav.reservations")} description="Crie um hotel primeiro." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <div className="surface overflow-hidden">
            {reservations.length === 0 ? (
              <EmptyState title={t("nav.reservations")} description={t("common.empty")} />
            ) : (
              <table className="font-ui w-full text-left text-sm">
                <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Datas</th>
                    <th className="px-4 py-3">Quartos</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.id} className="border-b border-sand-100 align-top">
                      <td className="px-4 py-3 font-medium text-ink-900">{r.code}</td>
                      <td className="px-4 py-3 text-stone-600">
                        {r.arrivalDate.toISOString().slice(0, 10)} →{" "}
                        {r.departureDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {r.rooms.map((rr) => rr.room.code).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill value={r.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ReservationActions id={r.id} status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <CreateReservationForm
            hotelId={hotelId}
            rooms={rooms}
            guests={guests.map((g) => ({
              id: g.id,
              label: `${g.firstName} ${g.lastName}`,
              email: g.email,
              phone: g.phone,
            }))}
          />
        </div>
      )}
    </AppShell>
  );
}
