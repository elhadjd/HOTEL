import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { listActiveStays } from "@/modules/stays/stay-service";

export async function GET(request: Request) {
  const authz = await requireTenant("stays.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const parsedStatus = z
    .enum(["ACTIVE", "CHECKOUT_PENDING", "COMPLETED", "CANCELLED"])
    .optional()
    .safeParse(status || undefined);
  try {
    const stays = await listActiveStays(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      roomId: url.searchParams.get("roomId") ?? undefined,
      guestId: url.searchParams.get("guestId") ?? undefined,
      status: parsedStatus.success ? parsedStatus.data : undefined,
    });
    return NextResponse.json({ stays });
  } catch (err) {
    return jsonError(err);
  }
}
