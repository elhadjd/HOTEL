import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  createReservation,
  listReservations,
} from "@/modules/reservations/reservation-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

const createSchema = z.object({
  hotelId: z.string().uuid(),
  arrivalDate: z.string().min(8),
  departureDate: z.string().min(8),
  adults: z.number().int().positive().optional(),
  children: z.number().int().min(0).optional(),
  source: z.string().max(64).optional(),
  internalNotes: z.string().max(2000).optional(),
  primaryGuestId: z.string().uuid().optional(),
  roomIds: z.array(z.string().uuid()).optional(),
  status: z.enum(["DRAFT", "PENDING", "CONFIRMED"]).optional(),
});

export async function GET(request: Request) {
  const authz = await requireTenant("reservations.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotelId") ?? undefined;
  const status = url.searchParams.get("status") as
    | "DRAFT"
    | "PENDING"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "CHECKED_OUT"
    | "CANCELLED"
    | "NO_SHOW"
    | null;

  try {
    const reservations = await listReservations(prisma, authz.ctx, {
      hotelId,
      status: status ?? undefined,
    });
    return NextResponse.json({ reservations });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("reservations.write");
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reservation payload" }, { status: 400 });
  }

  try {
    const reservation = await createReservation(prisma, authz.ctx, {
      ...parsed.data,
      arrivalDate: toDateOnlyUtc(parsed.data.arrivalDate),
      departureDate: toDateOnlyUtc(parsed.data.departureDate),
    });
    return NextResponse.json({ reservation }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
