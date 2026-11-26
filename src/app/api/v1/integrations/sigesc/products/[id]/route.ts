import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  getCentralProduct,
  updateCentralProduct,
} from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const updateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    code: z.string().max(64).optional().nullable(),
    barcode: z.string().max(64).optional().nullable(),
    reference: z.string().max(64).optional().nullable(),
    sale_price: z.number().nonnegative().optional().nullable(),
    sale_price_ex_tax: z.number().nonnegative().optional().nullable(),
    purchase_price: z.number().nonnegative().optional().nullable(),
    purchase_price_ex_tax: z.number().nonnegative().optional().nullable(),
    average_price: z.number().nonnegative().optional().nullable(),
    tax_percent: z.number().min(0).max(100).optional().nullable(),
    kind: z.enum(["product", "service"]).optional(),
    category_id: z.number().int().positive().optional().nullable(),
    inventory: z.boolean().optional(),
    allow_backorder: z.boolean().optional(),
    pricing_mode: z.string().max(32).optional().nullable(),
    min_quantity: z.number().nonnegative().optional().nullable(),
    manufacturer: z.string().max(120).optional().nullable(),
    image: z.string().max(500).optional().nullable(),
    tax_exception_code: z.string().max(32).optional().nullable(),
    tax_exception_reason: z.string().max(255).optional().nullable(),
    status: z.union([z.string(), z.boolean()]).optional(),
    is_sellable: z.boolean().optional(),
    unit_of_measure: z.string().max(32).optional().nullable(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const product = await getCentralProduct(prisma, authz.ctx, id);
    return NextResponse.json({ product });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

async function handleUpdate(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  try {
    const result = await updateCentralProduct(prisma, authz.ctx, id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export const PATCH = handleUpdate;
export const PUT = handleUpdate;
