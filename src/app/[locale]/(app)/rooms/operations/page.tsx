import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getRoomOperationsBoard } from "@/modules/front-desk/front-desk-service";
import { listHotels } from "@/modules/hotels/hotel-service";
import { RoomBoardClient } from "./room-board-client";

export default async function RoomOperationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("rooms.read");

  const [hotels, rooms] = await Promise.all([
    listHotels(prisma, ctx),
    getRoomOperationsBoard(prisma, ctx, {}),
  ]);

  const categories = await prisma.roomCategory.findMany({
    where: { hotel: { institutionId: ctx.institutionId } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  return (
    <AppShell title="Operações de quartos">
      <div className="mb-4 flex justify-end">
        <Badge tone="accent">Phase 8</Badge>
      </div>
      <RoomBoardClient
        initialRooms={rooms}
        hotels={hotels.map((h) => ({ value: h.id, label: h.name, keywords: [h.code ?? ""] }))}
        categories={categories.map((c) => ({
          value: c.id,
          label: c.name,
          keywords: [c.code ?? ""],
        }))}
      />
    </AppShell>
  );
}
