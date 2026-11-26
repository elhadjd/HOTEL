import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { reconcileHotelRoomOccupancies } from "@/modules/reservations/reservation-service";

const schema = z.object({
  hotelId: z.string().uuid().optional(),
  markExpiredAsNoShow: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("reservations.confirm");
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  try {
    const result = await reconcileHotelRoomOccupancies(
      prisma,
      authz.ctx,
      parsed.success ? parsed.data : {},
    );
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
