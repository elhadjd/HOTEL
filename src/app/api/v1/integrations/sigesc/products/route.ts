import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createCentralProduct,
  searchCentralProducts,
} from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["product", "service"]).optional(),
  description: z.string().max(2000).optional().nullable(),
  code: z.string().max(64).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  reference: z.string().max(64).optional().nullable(),
  sale_price: z.number().nonnegative().optional().nullable(),
  purchase_price: z.number().nonnegative().optional().nullable(),
  sale_price_ex_tax: z.number().nonnegative().optional().nullable(),
  purchase_price_ex_tax: z.number().nonnegative().optional().nullable(),
  tax_percent: z.number().min(0).max(100).optional().nullable(),
  status: z.union([z.string(), z.boolean()]).optional(),
  category_id: z.number().int().optional().nullable(),
  is_sellable: z.boolean().optional(),
  inventory: z.boolean().optional(),
  unit_of_measure: z.string().max(32).optional().nullable(),
  pricing_mode: z.string().max(64).optional().nullable(),
});

export async function GET(request: Request) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const result = await searchCentralProducts(prisma, authz.ctx, {
      search: url.searchParams.get("search") ?? url.searchParams.get("q") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      catalog: url.searchParams.get("catalog") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      category_id: url.searchParams.get("category_id") ?? undefined,
      page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
      per_page: url.searchParams.get("per_page")
        ? Number(url.searchParams.get("per_page"))
        : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product payload" }, { status: 400 });
  }
  try {
    const result = await createCentralProduct(prisma, authz.ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
