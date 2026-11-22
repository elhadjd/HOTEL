import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { deleteCatalogMapping } from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

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
