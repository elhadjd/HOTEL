import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { registerOperationalConsumption } from "@/modules/stays/operational-consumption-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const bodySchema = z.object({
  createDocumentIfMissing: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  lines: z
    .array(
      z.object({
        mappingLocalCode: z.string().min(1).max(64),
        quantity: z.number().positive(),
        discount: z.number().nonnegative().optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.manage");
  if (!authz.ok) return authz.response;
  const invoiceAuthz = await requireTenant("integrations.invoices");
  if (!invoiceAuthz.ok) return invoiceAuthz.response;

  const { stayId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid consumption payload" }, { status: 400 });
  }

  try {
    const result = await registerOperationalConsumption(prisma, authz.ctx, {
      stayId,
      lines: parsed.data.lines,
      createDocumentIfMissing: parsed.data.createDocumentIfMissing,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
