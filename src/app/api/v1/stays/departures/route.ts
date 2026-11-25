import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { listDepartures } from "@/modules/stays/check-out-service";

export async function GET(request: Request) {
  const authz = await requireTenant("stays.checkout");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const rawScope = url.searchParams.get("scope");
  const scope =
    rawScope === "today" || rawScope === "overdue" || rawScope === "all"
      ? rawScope
      : undefined;
  try {
    const departures = await listDepartures(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      onDate: url.searchParams.get("onDate")
        ? new Date(url.searchParams.get("onDate")!)
        : undefined,
      includeOverdue: url.searchParams.get("includeOverdue") !== "0",
      scope,
      focusStayId: url.searchParams.get("focusStayId") ?? undefined,
    });
    return NextResponse.json({ departures });
  } catch (err) {
    return jsonError(err);
  }
}
