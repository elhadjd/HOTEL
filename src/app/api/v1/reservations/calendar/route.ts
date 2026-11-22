import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { calendarReservations } from "@/modules/reservations/reservation-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

export async function GET(request: Request) {
  const authz = await requireTenant("reservations.read");
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotelId");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!hotelId || !fromRaw || !toRaw) {
    return NextResponse.json({ error: "hotelId, from and to are required" }, { status: 400 });
  }

  try {
    const reservations = await calendarReservations(prisma, authz.ctx, {
      hotelId,
      from: toDateOnlyUtc(fromRaw),
      to: toDateOnlyUtc(toRaw),
    });
    return NextResponse.json({ reservations });
  } catch (err) {
    return jsonError(err);
  }
}
