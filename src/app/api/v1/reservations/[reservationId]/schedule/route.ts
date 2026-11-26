import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { rescheduleReservation } from "@/modules/reservations/reservation-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const schema = z.object({
  arrivalDate: z.string().min(8).optional(),
  departureDate: z.string().min(8).optional(),
  expectedCheckInTime: z.string().regex(HHMM_REGEX).optional().nullable(),
  expectedCheckOutTime: z.string().regex(HHMM_REGEX).optional().nullable(),
  lateCheckOutApproved: z.boolean().optional(),
  allowRetroactive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ reservationId: string }> },
) {
  const authz = await requireTenant("reservations.write");
  if (!authz.ok) return authz.response;
  const { reservationId } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Horário ou datas inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const reservation = await rescheduleReservation(prisma, authz.ctx, reservationId, {
      ...parsed.data,
      arrivalDate: parsed.data.arrivalDate ? toDateOnlyUtc(parsed.data.arrivalDate) : undefined,
      departureDate: parsed.data.departureDate
        ? toDateOnlyUtc(parsed.data.departureDate)
        : undefined,
    });
    return NextResponse.json({
      reservation,
      scheduleWarnings: reservation.scheduleWarnings ?? [],
    });
  } catch (err) {
    return jsonError(err);
  }
}
