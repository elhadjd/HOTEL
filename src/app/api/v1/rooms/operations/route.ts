import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { getRoomOperationsBoard } from "@/modules/front-desk/front-desk-service";

export async function GET(request: Request) {
  const authz = await requireTenant("rooms.read");
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  try {
    const hotelId = url.searchParams.get("hotelId") ?? undefined;
    if (hotelId) {
      const hotel = await prisma.hotel.findFirst({
        where: { id: hotelId, institutionId: authz.ctx.institutionId },
      });
      if (!hotel) {
        return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
      }
    }
    const rooms = await getRoomOperationsBoard(prisma, authz.ctx, {
      hotelId,
      floor: url.searchParams.get("floor") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      occupancyStatus: url.searchParams.get("occupancyStatus") ?? undefined,
      housekeepingStatus: url.searchParams.get("housekeepingStatus") ?? undefined,
      maintenanceStatus: url.searchParams.get("maintenanceStatus") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    return NextResponse.json({ rooms, total: rooms.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Room board failed" },
      { status: 400 },
    );
  }
}
