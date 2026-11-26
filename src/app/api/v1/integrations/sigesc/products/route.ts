import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createCentralProduct,
  importCentralProductsToCatalog,
  searchCentralProducts,
} from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["product", "service"]).optional(),
  product_type_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  code: z.string().max(64).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  reference: z.string().max(64).optional().nullable(),
  sale_price: z.number().nonnegative().optional().nullable(),
  purchase_price: z.number().nonnegative().optional().nullable(),
  sale_price_ex_tax: z.number().nonnegative().optional().nullable(),
  purchase_price_ex_tax: z.number().nonnegative().optional().nullable(),
  average_price: z.number().nonnegative().optional().nullable(),
  tax_percent: z.number().min(0).max(100).optional().nullable(),
  tax_rate_id: z.number().int().positive().optional().nullable(),
  tax_exception_code: z.string().max(32).optional().nullable(),
  tax_exception_reason: z.string().max(255).optional().nullable(),
  status: z.union([z.string(), z.boolean()]).optional(),
  category_id: z.number().int().positive().optional().nullable(),
  is_sellable: z.boolean().optional(),
  inventory: z.boolean().optional(),
  allow_backorder: z.boolean().optional(),
  min_quantity: z.number().nonnegative().optional().nullable(),
  manufacturer: z.string().max(120).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  unit_of_measure: z.string().max(32).optional().nullable(),
  pricing_mode: z.enum(["unit", "weight"]).optional().nullable(),
  /** When true, immediately import the newly created central product into local hotel selects */
  importToHotel: z.boolean().optional(),
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
    return NextResponse.json(
      { error: "Dados do produto inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  try {
    const { importToHotel, product_type_id, ...productPayload } = parsed.data;
    const result = await createCentralProduct(prisma, authz.ctx, {
      ...productPayload,
      ...(product_type_id != null ? { product_type_id } : {}),
    });
    let importResult = null;
    if (importToHotel && result.product?.id) {
      try {
        importResult = await importCentralProductsToCatalog(prisma, authz.ctx, {
          mode: "single",
          product: result.product,
        });
      } catch {
        // Product was created in central; caller can retry import separately
      }
    }
    return NextResponse.json({ ...result, importResult }, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
