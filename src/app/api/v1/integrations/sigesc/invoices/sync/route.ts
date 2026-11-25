import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";
import { syncOpenInvoicesFromCentral } from "@/modules/sigesc-integration/connection-service";

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

  try {
    const result = await syncOpenInvoicesFromCentral(prisma, authz.ctx, limit);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
