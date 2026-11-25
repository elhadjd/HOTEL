import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { deleteCatalogMapping } from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const patchSchema = z.object({
  active: z.boolean(),
});

export async function PATCH(
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
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mapping update payload" }, { status: 400 });
  }

  try {
    const existing = await prisma.productCatalogMapping.findUnique({ where: { id } });
    if (!existing || existing.institutionId !== authz.ctx.institutionId) {
      return NextResponse.json({ error: "Catalog mapping not found" }, { status: 404 });
    }
    const updated = await prisma.productCatalogMapping.update({
      where: { id },
      data: { active: parsed.data.active },
    });
    return NextResponse.json({
      mapping: {
        ...updated,
        centralSalePrice:
          updated.centralSalePrice != null ? Number(updated.centralSalePrice) : null,
        centralTaxPercent:
          updated.centralTaxPercent != null ? Number(updated.centralTaxPercent) : null,
      },
    });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    await deleteCatalogMapping(prisma, authz.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
