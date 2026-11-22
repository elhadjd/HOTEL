import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { getHotel, updateHotel } from "@/modules/hotels/hotel-service";

const updateSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  street: z.string().max(255).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  zipCode: z.string().max(32).nullable().optional(),
  active: z.boolean().optional(),
  checkInTime: z.string().max(8).optional(),
  checkOutTime: z.string().max(8).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().max(8).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const authz = await requireTenant("hotels.read");
  if (!authz.ok) return authz.response;
  const { hotelId } = await params;
  try {
    const hotel = await getHotel(prisma, authz.ctx, hotelId);
    return NextResponse.json({ hotel });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const authz = await requireTenant("hotels.write");
  if (!authz.ok) return authz.response;
  const { hotelId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hotel payload" }, { status: 400 });
  }

  try {
    const hotel = await updateHotel(prisma, authz.ctx, hotelId, parsed.data);
    return NextResponse.json({ hotel });
  } catch (err) {
    return jsonError(err);
  }
}
