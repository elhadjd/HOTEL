import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { listRooms, roomsByFloor } from "@/modules/rooms/room-service";
import { CreateRoomForm } from "./create-room-form";
import { CategoryMappingPanel } from "./category-mapping-panel";

export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string; view?: string }>;
}) {
  const { locale } = await params;
  const { hotelId: hotelIdParam, view = "grid" } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("rooms.read");
  const hotels = await listHotels(prisma, ctx);
  const hotelId = hotelIdParam ?? hotels[0]?.id;

  if (!hotelId) {
    return (
      <AppShell title={t("nav.rooms")}>
        <EmptyState title={t("nav.rooms")} description="Crie um hotel antes de gerir quartos." />
      </AppShell>
    );
  }

  const [rooms, categories, catalogMappings] = await Promise.all([
    listRooms(prisma, ctx, hotelId),
    prisma.roomCategory.findMany({
      where: { hotelId },
      orderBy: { name: "asc" },
    }),
    prisma.productCatalogMapping.findMany({
      where: { institutionId: ctx.institutionId, active: true },
      orderBy: { localCode: "asc" },
      select: {
        id: true,
        localCode: true,
        localLabel: true,
        centralSalePrice: true,
      },
      take: 200,
    }),
  ]);
  const floors = roomsByFloor(rooms);

  return (
    <AppShell title={t("nav.rooms")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-sm text-stone-500">
            Ocupação, governança e manutenção em dimensões separadas.
          </p>
          {hotels.length > 1 ? (
            <div className="font-ui mt-3 flex flex-wrap gap-2 text-sm">
              {hotels.map((h) => (
                <a
                  key={h.id}
                  href={`?hotelId=${h.id}&view=${view}`}
                  className={
                    h.id === hotelId
                      ? "rounded-md bg-ink-900 px-3 py-1.5 text-white"
                      : "rounded-md border border-sand-200 bg-white px-3 py-1.5 text-stone-600 hover:bg-sand-50"
                  }
                >
                  {h.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`?hotelId=${hotelId}&view=grid`}
            className={`font-ui rounded-md px-3 py-1.5 text-sm ${view === "grid" ? "bg-teal-600 text-white" : "border border-sand-200 bg-white"}`}
          >
            Grelha
          </a>
          <a
            href={`?hotelId=${hotelId}&view=list`}
            className={`font-ui rounded-md px-3 py-1.5 text-sm ${view === "list" ? "bg-teal-600 text-white" : "border border-sand-200 bg-white"}`}
          >
            Lista
          </a>
          <a
            href={`?hotelId=${hotelId}&view=floor`}
            className={`font-ui rounded-md px-3 py-1.5 text-sm ${view === "floor" ? "bg-teal-600 text-white" : "border border-sand-200 bg-white"}`}
          >
            Andares
          </a>
          <CreateRoomForm
            hotelId={hotelId}
            categories={categories.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
          />
        </div>
      </div>

      {/* Full-width Rooms Display */}
      <div>
        {rooms.length === 0 ? (
          <EmptyState title={t("nav.rooms")} description="Sem quartos neste hotel." />
        ) : view === "list" ? (
          <div className="surface overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quarto</th>
                  <th>Categoria</th>
                  <th>Ocupação</th>
                  <th>Governança</th>
                  <th>Manutenção</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="font-medium text-ink-900">
                      {room.code}
                      {room.floor ? (
                        <span className="ml-2 text-stone-400">· {room.floor}</span>
                      ) : null}
                    </td>
                    <td className="text-stone-600">{room.category.name}</td>
                    <td>
                      <StatusPill value={room.occupancyStatus} />
                    </td>
                    <td>
                      <StatusPill value={room.housekeepingStatus} />
                    </td>
                    <td>
                      <StatusPill value={room.maintenanceStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "floor" ? (
          <div className="space-y-5">
            {floors.map(([floor, floorRooms]) => (
              <section key={floor}>
                <h3 className="font-ui mb-3 text-xs uppercase tracking-[0.18em] text-stone-400">
                  Andar {floor}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {floorRooms.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <CategoryMappingPanel
          hotelId={hotelId}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            accommodationMappingId: c.accommodationMappingId,
          }))}
          catalogMappings={catalogMappings.map((m) => ({
            id: m.id,
            localCode: m.localCode,
            localLabel: m.localLabel,
            centralSalePrice:
              m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
          }))}
        />
      </div>
    </AppShell>
  );
}

function RoomCard({
  room,
}: {
  room: {
    id: string;
    code: string;
    floor: string | null;
    occupancyStatus: string;
    housekeepingStatus: string;
    maintenanceStatus: string;
    category: { name: string };
  };
}) {
  return (
    <article className="surface-interactive p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-semibold text-ink-900">{room.code}</p>
          <p className="font-ui text-sm text-stone-500">
            {room.category.name}
            {room.floor ? ` · Andar ${room.floor}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill value={room.occupancyStatus} />
        <StatusPill value={room.housekeepingStatus} />
        <StatusPill value={room.maintenanceStatus} />
      </div>
    </article>
  );
}
