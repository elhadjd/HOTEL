import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createHotel, listHotels } from "@/modules/hotels/hotel-service";

const createSchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  street: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  zipCode: z.string().max(32).optional(),
  checkInTime: z.string().max(8).optional(),
  checkOutTime: z.string().max(8).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().max(8).optional(),
});

export async function GET() {
  const authz = await requireTenant("hotels.read");
  if (!authz.ok) return authz.response;
  try {
    const hotels = await listHotels(prisma, authz.ctx);
    return NextResponse.json({ hotels });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("hotels.write");
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hotel payload" }, { status: 400 });
  }

  try {
    const hotel = await createHotel(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ hotel }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
