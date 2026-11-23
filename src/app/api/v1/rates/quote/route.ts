import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { quoteAccommodation } from "@/modules/rates/rates-service";

const schema = z.object({
  hotelId: z.string().uuid(),
  categoryId: z.string().uuid(),
  arrivalDate: z.string().min(8),
  departureDate: z.string().min(8),
  occupants: z.number().int().min(1).optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("rates.read");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quote payload" }, { status: 400 });
  }
  try {
    const quote = await quoteAccommodation(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ quote });
  } catch (err) {
    return jsonError(err);
  }
}
