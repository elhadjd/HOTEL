import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { confirmReservation } from "@/modules/reservations/reservation-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const authz = await requireTenant("reservations.confirm");
  if (!authz.ok) return authz.response;
  const { reservationId } = await params;
  try {
    const reservation = await confirmReservation(prisma, authz.ctx, reservationId);
    return NextResponse.json({ reservation });
  } catch (err) {
    return jsonError(err);
  }
}
