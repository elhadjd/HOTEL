import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="font-ui flex flex-wrap gap-2 text-sm">
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
        <Badge tone="accent">Phase 3</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {categories.length === 0 ? (
            <EmptyState title={t("nav.roomCategories")} description="Sem categorias." />
          ) : (
            categories.map((cat) => (
              <article key={cat.id} className="surface p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-ui text-xs uppercase tracking-[0.16em] text-stone-400">
                      {cat.code}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-ink-900">{cat.name}</h2>
                    <p className="font-ui mt-1 text-sm text-stone-500">
                      Até {cat.maxOccupancy} hóspedes · {cat.maxAdults} adultos ·{" "}
                      {cat.maxChildren} crianças
                    </p>
                  </div>
                  <p className="font-ui text-sm text-stone-500">{cat._count.rooms} quartos</p>
                </div>
                {cat.defaultTariff != null ? (
                  <p className="font-ui mt-3 text-sm text-teal-800">
                    Tarifa operacional: {String(cat.defaultTariff)}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
        <CreateCategoryForm hotelId={hotelId} />
      </div>
    </AppShell>
  );
}
