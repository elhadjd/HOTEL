import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  listCatalogMappings,
  upsertCatalogMapping,
} from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const upsertSchema = z
  .object({
    localCode: z.string().min(1).max(64),
    localLabel: z.string().min(1).max(255),
    kind: z.enum(["PRODUCT", "SERVICE"]).optional(),
    centralProductId: z.union([z.string(), z.number()]),
    active: z.boolean().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const takeRaw = url.searchParams.get("take");
    const activeOnly = url.searchParams.get("activeOnly") === "1";
    const mappings = await listCatalogMappings(prisma, authz.ctx, {
      q,
      take: takeRaw ? Number(takeRaw) || 50 : q ? 50 : undefined,
      activeOnly: activeOnly || undefined,
    });
    return NextResponse.json({
      mappings,
      capped: Boolean(q || takeRaw) && mappings.length >= (takeRaw ? Number(takeRaw) || 50 : 50),
    });
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
