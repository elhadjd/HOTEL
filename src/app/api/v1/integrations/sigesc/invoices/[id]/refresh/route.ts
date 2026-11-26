import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  extractInvoicePayments,
  refreshInvoiceFromCentral,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const invoice = await refreshInvoiceFromCentral(prisma, authz.ctx, id);
    return NextResponse.json({
      invoice,
      payments: extractInvoicePayments(invoice.linesJson),
    });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
