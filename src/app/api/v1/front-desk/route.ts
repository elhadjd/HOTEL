import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { getFrontDeskSnapshot } from "@/modules/front-desk/front-desk-service";

export async function GET(request: Request) {
  const authz = await requireTenant("dashboard.read");
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotelId") ?? undefined;
  const onDate = url.searchParams.get("date")
    ? new Date(url.searchParams.get("date")!)
    : undefined;

  try {
    if (hotelId) {
      const hotel = await prisma.hotel.findFirst({
        where: { id: hotelId, institutionId: authz.ctx.institutionId },
      });
      if (!hotel) {
        return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
      }
    }
    const snapshot = await getFrontDeskSnapshot(prisma, authz.ctx, { hotelId, onDate });
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Front desk failed" },
      { status: 400 },
    );
  }
}
