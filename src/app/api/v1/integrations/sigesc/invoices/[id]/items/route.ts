import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { addItemsToInvoice } from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        mappingLocalCode: z.string().min(1).max(64).optional(),
        centralProductId: z.union([z.string(), z.number()]).optional(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
        discount: z.number().nonnegative().optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.invoices");
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
    return NextResponse.json({ error: "Invalid items payload" }, { status: 400 });
  }
  try {
    const invoice = await addItemsToInvoice(
      prisma,
      authz.ctx,
      id,
      parsed.data.lines.map((l) => ({
        ...l,
        centralProductId: l.centralProductId !== undefined ? String(l.centralProductId) : undefined,
      })),
    );
    return NextResponse.json({ invoice });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
