import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { checkInReservation, listArrivals } from "@/modules/stays/stay-service";

export async function GET(request: Request) {
  const authz = await requireTenant("stays.checkin");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotelId") ?? undefined;
  const onDate = url.searchParams.get("onDate") ?? undefined;
  try {
    const arrivals = await listArrivals(prisma, authz.ctx, {
      hotelId,
      onDate: onDate ? new Date(onDate) : undefined,
    });
    return NextResponse.json({ arrivals });
  } catch (err) {
    return jsonError(err);
  }
}

const bodySchema = z.object({
  reservationId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  companionGuestIds: z.array(z.string().uuid()).max(20).optional(),
  actualArrival: z.string().datetime().optional(),
  observations: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("stays.checkin");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-in payload", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const stay = await checkInReservation(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ stay }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
