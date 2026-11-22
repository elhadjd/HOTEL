import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createRoom, listRooms } from "@/modules/rooms/room-service";

const createSchema = z.object({
  categoryId: z.string().uuid(),
  code: z.string().min(1).max(64),
  floor: z.string().max(32).optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().max(2000).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const authz = await requireTenant("rooms.read");
  if (!authz.ok) return authz.response;
  const { hotelId } = await params;
  const url = new URL(request.url);
  const floor = url.searchParams.get("floor") ?? undefined;

  try {
    const rooms = await listRooms(prisma, authz.ctx, hotelId, { floor });
    return NextResponse.json({ rooms });
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
    return NextResponse.json({ error: "Invalid room payload" }, { status: 400 });
  }

  try {
    const room = await createRoom(prisma, authz.ctx, hotelId, parsed.data);
    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
