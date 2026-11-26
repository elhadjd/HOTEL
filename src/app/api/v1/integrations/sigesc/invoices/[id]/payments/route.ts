import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  extractInvoicePayments,
  settleInvoicePayment,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const bodySchema = z
  .object({
    amount: z.number().positive(),
    paymentMethodId: z.number().int().positive(),
    bankAccountId: z.number().int().positive().optional().nullable(),
    reference: z.string().max(128).optional(),
    notes: z.string().max(500).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    type: z.enum(["payment", "advance"]).optional(),
    idempotencyKey: z.string().min(4).max(191),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices.settle");
  if (!authz.ok) return authz.response;

  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment payload" }, { status: 400 });
  }

  try {
    const result = await settleInvoicePayment(prisma, authz.ctx, id, parsed.data);
    const status = result.reconciliationRequired ? 202 : result.created ? 201 : 200;
    return NextResponse.json(
      {
        ...result,
        payments: extractInvoicePayments(result.invoice.linesJson),
      },
      { status },
    );
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
