import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import {
  CENTRAL_PRICE_FRESHNESS_MS,
  isCentralPriceFresh,
  listCatalogMappings,
  searchCentralProducts,
} from "@/modules/sigesc-integration/products/products-service";
import { ProductsClient } from "./products-client";

export default async function CentralProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("integrations.products");

  let products: Awaited<ReturnType<typeof searchCentralProducts>>["data"] = [];
  let pagination:
    | { current_page?: number; per_page?: number; total?: number; last_page?: number }
    | undefined;
  let mappings: Awaited<ReturnType<typeof listCatalogMappings>> = [];
  let loadError: string | null = null;
  try {
    const [list, maps] = await Promise.all([
      searchCentralProducts(prisma, ctx, { per_page: 25 }),
      listCatalogMappings(prisma, ctx),
    ]);
    products = list.data ?? [];
    pagination = list.meta?.pagination;
    mappings = maps;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Falha ao carregar catálogo";
  }

  return (
    <AppShell title={t("nav.centralProducts")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Catálogo oficial do Sistema Central (preços verificados a cada{" "}
          {CENTRAL_PRICE_FRESHNESS_MS / 60000} min). Importe produtos em lote ou crie novos itens
          diretamente no servidor central.
        </p>
        <Badge tone="accent">Catálogo Central</Badge>
      </div>
      {loadError ? (
        <div className="surface p-5">
          <p className="font-ui text-sm text-amber-800">{loadError}</p>
        </div>
      ) : (
        <ProductsClient
          initialProducts={products ?? []}
          initialPagination={pagination}
          mappings={mappings.map((m) => ({
            id: m.id,
            localCode: m.localCode,
            localLabel: m.localLabel,
            centralProductId: m.centralProductId,
            centralName: m.centralName,
            centralSalePrice: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
            centralTaxPercent: m.centralTaxPercent != null ? Number(m.centralTaxPercent) : null,
            centralPriceVerifiedAt: m.centralPriceVerifiedAt?.toISOString() ?? null,
            legacyHistoricalPrice:
              m.legacyHistoricalPrice != null ? Number(m.legacyHistoricalPrice) : null,
            active: m.active,
            priceFresh: isCentralPriceFresh(m.centralPriceVerifiedAt),
          }))}
        />
      )}
    </AppShell>
  );
}
