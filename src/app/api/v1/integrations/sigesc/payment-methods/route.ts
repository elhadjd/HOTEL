import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { listCentralPaymentMethods } from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function GET() {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;

  try {
    const data = await listCentralPaymentMethods(prisma, authz.ctx);
    return NextResponse.json(data);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
