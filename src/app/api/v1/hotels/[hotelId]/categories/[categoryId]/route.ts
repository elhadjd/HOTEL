import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { updateCategory } from "@/modules/rooms/room-service";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  maxOccupancy: z.number().int().positive().optional(),
  maxAdults: z.number().int().positive().optional(),
  maxChildren: z.number().int().min(0).optional(),
  bedConfiguration: z.string().max(255).nullable().optional(),
  defaultTariff: z.number().nonnegative().nullable().optional(),
  accommodationMappingId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ hotelId: string; categoryId: string }> },
) {
  const authz = await requireTenant("rooms.write");
  if (!authz.ok) return authz.response;
  const { hotelId, categoryId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category update payload" }, { status: 400 });
  }

  try {
    const category = await updateCategory(prisma, authz.ctx, hotelId, categoryId, parsed.data);
    return NextResponse.json({ category });
  } catch (err) {
    return jsonError(err);
  }
}
