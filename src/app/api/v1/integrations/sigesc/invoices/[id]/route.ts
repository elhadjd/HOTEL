import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { getInvoiceIntegration } from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const invoice = await getInvoiceIntegration(prisma, authz.ctx, id);
    return NextResponse.json({ invoice });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
