import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { findEligibleInvoiceForStay } from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function GET(request: Request) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  const stayId = new URL(request.url).searchParams.get("stayId");
  if (!stayId) {
    return NextResponse.json({ error: "stayId is required" }, { status: 400 });
  }
  try {
    const invoice = await findEligibleInvoiceForStay(prisma, authz.ctx, stayId);
    return NextResponse.json({ invoice });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
