import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  listCatalogMappings,
  upsertCatalogMapping,
} from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const upsertSchema = z.object({
  localCode: z.string().min(1).max(64),
  localLabel: z.string().min(1).max(255),
  localOperationalPrice: z.number().nonnegative().optional().nullable(),
  kind: z.enum(["PRODUCT", "SERVICE"]).optional(),
  centralProductId: z.union([z.string(), z.number()]),
  active: z.boolean().optional(),
});

export async function GET() {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  try {
    const mappings = await listCatalogMappings(prisma, authz.ctx);
    return NextResponse.json({ mappings });
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
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mapping payload" }, { status: 400 });
  }
  try {
    const mapping = await upsertCatalogMapping(prisma, authz.ctx, {
      ...parsed.data,
      centralProductId: String(parsed.data.centralProductId),
    });
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
