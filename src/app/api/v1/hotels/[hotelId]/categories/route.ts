import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createCategory, listCategories } from "@/modules/rooms/room-service";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  maxOccupancy: z.number().int().positive().optional(),
  maxAdults: z.number().int().positive().optional(),
  maxChildren: z.number().int().min(0).optional(),
  bedConfiguration: z.string().max(255).optional(),
  defaultTariff: z.number().nonnegative().optional(),
  accommodationMappingId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const authz = await requireTenant("rooms.read");
  if (!authz.ok) return authz.response;
  const { hotelId } = await params;
  try {
    const categories = await listCategories(prisma, authz.ctx, hotelId);
    return NextResponse.json({ categories });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const authz = await requireTenant("rooms.write");
  if (!authz.ok) return authz.response;
  const { hotelId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category payload" }, { status: 400 });
  }

  try {
    const category = await createCategory(prisma, authz.ctx, hotelId, parsed.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
