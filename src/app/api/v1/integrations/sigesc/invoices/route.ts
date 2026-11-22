import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createInvoiceDraft,
  listInvoiceIntegrations,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const lineSchema = z.object({
  mappingLocalCode: z.string().min(1).max(64).optional(),
  centralProductId: z.union([z.string(), z.number()]).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  description: z.string().max(500).optional(),
});

const createSchema = z.object({
  reservationId: z.string().uuid().optional(),
  guestId: z.string().uuid().optional(),
  state: z.string().min(1),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1),
  useCustomerFallback: z.boolean().optional(),
  customerFallback: z
    .object({
      name: z.string().max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
      nif: z.string().max(64).optional(),
    })
    .optional(),
});

export async function GET() {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  try {
    const invoices = await listInvoiceIntegrations(prisma, authz.ctx);
    return NextResponse.json({ invoices });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice payload", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const invoice = await createInvoiceDraft(prisma, authz.ctx, {
      ...parsed.data,
      lines: parsed.data.lines.map((l) => ({
        ...l,
        centralProductId: l.centralProductId !== undefined ? String(l.centralProductId) : undefined,
      })),
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
