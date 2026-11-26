import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { listCategories } from "@/modules/rooms/room-service";
import { CreateCategoryForm } from "./create-category-form";

export default async function RoomCategoriesPage({
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
  const ctx = await requirePageTenant("rooms.read");
  const hotels = await listHotels(prisma, ctx);
  const hotelId = hotelIdParam ?? hotels[0]?.id;

  if (!hotelId) {
    return (
      <AppShell title={t("nav.roomCategories")}>
        <EmptyState
          title={t("nav.roomCategories")}
          description="Crie um hotel antes de definir categorias."
        />
      </AppShell>
    );
  }

  const categories = await listCategories(prisma, ctx, hotelId);

  return (
    <AppShell title={t("nav.roomCategories")}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-ui text-sm text-stone-500">
            Tipologias de alojamento, capacidade e tarifas operacionais.
          </p>
          {hotels.length > 1 ? (
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
          ) : null}
        </div>
        <CreateCategoryForm hotelId={hotelId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState title={t("nav.roomCategories")} description="Sem categorias." />
          </div>
        ) : (
          categories.map((cat) => (
            <article key={cat.id} className="surface-interactive p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-stone-400">
                    {cat.code}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-ink-900">{cat.name}</h2>
                  <p className="font-ui mt-1 text-sm text-stone-500">
                    Até {cat.maxOccupancy} hóspedes · {cat.maxAdults} adultos · {cat.maxChildren}{" "}
                    crianças
                  </p>
                </div>
                <span className="h-fit rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                  {cat._count.rooms} quartos
                </span>
              </div>
              {cat.defaultTariff != null ? (
                <p className="font-ui mt-3 text-sm font-medium text-teal-800">
                  Tarifa operacional: {String(cat.defaultTariff)}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
