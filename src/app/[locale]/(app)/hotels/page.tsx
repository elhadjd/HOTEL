import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { CreateHotelForm } from "./create-hotel-form";

export default async function HotelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("hotels.read");
  const hotels = await listHotels(prisma, ctx);

  return (
    <AppShell title={t("nav.hotels")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui max-w-2xl text-sm text-stone-500">
            Estabelecimentos de alojamento da sua instituição — isolamento por tenant.
          </p>
        </div>
        <Badge tone="accent">Phase 3</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {hotels.length === 0 ? (
            <EmptyState
              title={t("nav.hotels")}
              description="Ainda não existem hotéis. Crie o primeiro estabelecimento."
            />
          ) : (
            hotels.map((hotel) => (
              <article key={hotel.id} className="surface animate-fade-up p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-ui text-xs uppercase tracking-[0.18em] text-stone-400">
                      {hotel.code}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-ink-900">{hotel.name}</h2>
                    <p className="font-ui mt-1 text-sm text-stone-500">
                      {[hotel.city, hotel.country].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="font-ui text-right text-sm text-stone-500">
                    <p>{hotel._count.rooms} quartos</p>
                    <p>{hotel._count.roomCategories} categorias</p>
                  </div>
                </div>
                <p className="font-ui mt-4 text-sm">
                  <Link className="text-teal-700 hover:underline" href={`/rooms?hotelId=${hotel.id}`}>
                    Ver quartos
                  </Link>
                  {" · "}
                  <Link
                    className="text-teal-700 hover:underline"
                    href={`/room-categories?hotelId=${hotel.id}`}
                  >
                    Categorias
                  </Link>
                </p>
              </article>
            ))
          )}
        </div>
        <CreateHotelForm />
      </div>
    </AppShell>
  );
}
