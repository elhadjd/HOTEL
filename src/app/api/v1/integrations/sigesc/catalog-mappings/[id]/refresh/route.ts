import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { refreshCatalogMappingPrice } from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const mapping = await refreshCatalogMappingPrice(prisma, authz.ctx, id);
    return NextResponse.json({
      mapping: {
        ...mapping,
        centralSalePrice:
          mapping.centralSalePrice != null ? Number(mapping.centralSalePrice) : null,
        centralTaxPercent:
          mapping.centralTaxPercent != null ? Number(mapping.centralTaxPercent) : null,
        legacyHistoricalPrice:
          mapping.legacyHistoricalPrice != null
            ? Number(mapping.legacyHistoricalPrice)
            : null,
        priceVerified: Boolean(mapping.centralPriceVerifiedAt),
        centralPriceVerifiedAt: mapping.centralPriceVerifiedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
