import { NextResponse } from "next/server";
import { resolveAggregateMode } from "@/modules/sigesc-integration";

export async function GET() {
  return NextResponse.json({
    ok: true,
    product: "sigesc-hotelaria",
    aggregateMode: resolveAggregateMode(),
    ts: new Date().toISOString(),
  });
}
