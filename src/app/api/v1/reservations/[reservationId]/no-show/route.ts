import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { markReservationNoShow } from "@/modules/reservations/reservation-service";

const schema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ reservationId: string }> },
) {
  const authz = await requireTenant("reservations.confirm");
  if (!authz.ok) return authz.response;
  const { reservationId } = await context.params;

  let note: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (parsed.success) note = parsed.data.note;
  } catch {
    // Optional body
  }

  try {
    const reservation = await markReservationNoShow(prisma, authz.ctx, reservationId, note);
    return NextResponse.json({ reservation });
  } catch (err) {
    return jsonError(err);
  }
}
