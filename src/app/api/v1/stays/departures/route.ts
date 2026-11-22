import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { listDepartures } from "@/modules/stays/check-out-service";

export async function GET(request: Request) {
  const authz = await requireTenant("stays.checkout");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const departures = await listDepartures(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      onDate: url.searchParams.get("onDate")
        ? new Date(url.searchParams.get("onDate")!)
        : undefined,
    });
    return NextResponse.json({ departures });
  } catch (err) {
    return jsonError(err);
  }
}
