import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createInvoiceDraft,
  listInvoiceIntegrations,
  summarizeInvoiceLines,
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
  stayId: z.string().uuid().optional(),
  hotelId: z.string().uuid().optional(),
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

export async function GET(request: Request) {
  const authz = await requireTenant("integrations.invoices");
  if (!authz.ok) return authz.response;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status") || undefined;
    const result = await listInvoiceIntegrations(prisma, authz.ctx, {
      q: url.searchParams.get("q") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      status: status as
        | "DRAFT"
        | "PENDING_SUBMISSION"
        | "SUBMITTING"
        | "CREATED"
        | "RECONCILIATION_REQUIRED"
        | "FAILED_VALIDATION"
        | "FAILED_FINAL"
        | undefined,
      guestId: url.searchParams.get("guestId") ?? undefined,
      stayId: url.searchParams.get("stayId") ?? undefined,
      reservationId: url.searchParams.get("reservationId") ?? undefined,
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: Number(url.searchParams.get("take") ?? 50) || 50,
      skip: Number(url.searchParams.get("skip") ?? 0) || 0,
    });

    return NextResponse.json({
      invoices: result.rows.map((inv) => ({
        ...inv,
        summary: summarizeInvoiceLines(inv.linesJson),
        centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
        centralSubtotal: inv.centralSubtotal != null ? Number(inv.centralSubtotal) : null,
        centralTax: inv.centralTax != null ? Number(inv.centralTax) : null,
        centralRestPayable:
          inv.centralRestPayable != null ? Number(inv.centralRestPayable) : null,
      })),
      total: result.total,
      take: result.take,
      skip: result.skip,
    });
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
    return NextResponse.json(
      { error: "Invalid invoice payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const invoice = await createInvoiceDraft(prisma, authz.ctx, {
      ...parsed.data,
      lines: parsed.data.lines.map((l) => ({
        ...l,
        centralProductId:
          l.centralProductId !== undefined ? String(l.centralProductId) : undefined,
      })),
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
