import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  extractInvoicePayments,
  publishInvoice,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const bodySchema = z
  .object({
    documentType: z
      .enum(["receipt", "advance", "global", "generic", "FT", "FA", "FG", "GF"])
      .optional(),
    idempotencyKey: z.string().min(4).max(191).optional(),
    dateDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices.settle");
  if (!authz.ok) return authz.response;

  const { id } = await context.params;

  let json: unknown = {};
  const raw = await request.text();
  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid publish payload" }, { status: 400 });
  }

  try {
    const result = await publishInvoice(prisma, authz.ctx, id, parsed.data);
    return NextResponse.json(
      {
        ...result,
        payments: extractInvoicePayments(result.invoice.linesJson),
      },
      { status: result.reconciliationRequired ? 202 : 200 },
    );
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
