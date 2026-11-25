import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { submitInvoice } from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const invoice = await submitInvoice(prisma, authz.ctx, id);
    if (invoice.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json(
        {
          invoice,
          reconciliationRequired: true,
          warning:
            invoice.lastError ??
            "SIGESC submission timed out or was unavailable. Reconcile before assuming the document exists.",
        },
        { status: 202 },
      );
    }
    return NextResponse.json({ invoice, reconciliationRequired: false });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
