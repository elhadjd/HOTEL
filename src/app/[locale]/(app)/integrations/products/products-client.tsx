"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Product = {
  id: number;
  name: string;
  code?: string | null;
  kind?: string | null;
  sale_price?: number | null;
  tax_percent?: number | null;
  status?: string | boolean | null;
};

type Mapping = {
  id: string;
  localCode: string;
  localLabel: string;
  centralProductId: string;
  centralName: string | null;
  centralSalePrice: number | null;
  centralTaxPercent: number | null;
  centralPriceVerifiedAt: string | null;
  legacyHistoricalPrice: number | null;
  active: boolean;
  priceFresh: boolean;
};

export function ProductsClient({
  initialProducts,
  mappings: initialMappings,
}: {
  initialProducts: Product[];
  mappings: Mapping[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState("service");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState(initialProducts);
  const [mappings, setMappings] = useState(initialMappings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [localCode, setLocalCode] = useState("accommodation");
  const [localLabel, setLocalLabel] = useState("Alojamento");
  const [mappingKind, setMappingKind] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [centralProductId, setCentralProductId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newKind, setNewKind] = useState<"service" | "product">("service");

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: p.name,
        keywords: [String(p.id), p.code ?? "", p.kind ?? ""],
        description:
          p.sale_price != null
            ? `#${p.id}${p.code ? ` · ${p.code}` : ""} · ${p.sale_price} AOA`
            : `#${p.id}${p.code ? ` · ${p.code}` : ""}`,
      })),
    [products],
  );

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/v1/integrations/sigesc/products?kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(q)}&per_page=50`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setProducts(data.data ?? []);
    });
  }

  function mapProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/catalog-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localCode,
          localLabel,
          kind: mappingKind,
          centralProductId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Mapping failed");
        return;
      }
      const m = data.mapping;
      setMappings((prev) => {
        const rest = prev.filter((x) => x.localCode !== m.localCode);
        return [
          ...rest,
          {
            id: m.id,
            localCode: m.localCode,
            localLabel: m.localLabel,
            centralProductId: m.centralProductId,
            centralName: m.centralName,
            centralSalePrice: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
            centralTaxPercent: m.centralTaxPercent != null ? Number(m.centralTaxPercent) : null,
            centralPriceVerifiedAt: m.centralPriceVerifiedAt
              ? new Date(m.centralPriceVerifiedAt).toISOString()
              : null,
            legacyHistoricalPrice:
              m.legacyHistoricalPrice != null ? Number(m.legacyHistoricalPrice) : null,
            active: m.active,
            priceFresh: true,
          },
        ].sort((a, b) => a.localCode.localeCompare(b.localCode));
      });
      router.refresh();
    });
  }

  function refreshPrice(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings/${id}/refresh`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Price refresh failed — central price could not be verified");
        return;
      }
      const m = data.mapping;
      setMappings((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                centralSalePrice: m.centralSalePrice,
                centralTaxPercent: m.centralTaxPercent,
                centralName: m.centralName,
                centralPriceVerifiedAt: m.centralPriceVerifiedAt,
                priceFresh: true,
              }
            : x,
        ),
      );
    });
  }

  function toggleMappingActive(id: string, nextActive: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar estado do mapeamento");
        return;
      }
      setMappings((prev) =>
        prev.map((x) => (x.id === id ? { ...x, active: nextActive } : x)),
      );
      router.refresh();
    });
  }

  function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          kind: newKind,
          sale_price: newPrice ? Number(newPrice) : 0,
          is_sellable: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Create failed");
        return;
      }
      setProducts((prev) => [data.product, ...prev]);
      setNewName("");
      setNewPrice("");
    });
  }

  return (
    <div className="space-y-8">
      {error ? <p className="font-ui text-sm text-red-700">{error}</p> : null}

      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm text-ink-900">
          O preço oficial vem exclusivamente do <strong>SIGESC Central</strong>. Não existe preço
          operacional independente editável em Hotelaria.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Catálogo central</h2>
        <form onSubmit={search} className="mb-4 flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="font-ui h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
          >
            <option value="service">Serviços</option>
            <option value="product">Produtos</option>
            <option value="all">Todos</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar…"
            className="font-ui h-10 min-w-[14rem] flex-1 rounded-md border border-sand-200 px-3 text-sm"
          />
          <Button type="submit" disabled={pending}>
            Pesquisar
          </Button>
        </form>
        <div className="surface overflow-hidden">
          <table className="font-ui w-full text-left text-sm">
            <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Preço central</th>
                <th className="px-4 py-3">IVA %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-sand-100">
                  <td className="px-4 py-3 text-stone-500">{p.id}</td>
                  <td className="px-4 py-3 font-medium text-ink-900">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.sale_price ?? "—"}
                    <span className="ml-1 text-xs text-stone-400">SIGESC</span>
                  </td>
                  <td className="px-4 py-3">{p.tax_percent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={createProduct} className="surface p-5">
          <h3 className="text-lg font-semibold text-ink-900">Criar no catálogo SIGESC</h3>
          <p className="font-ui mt-1 text-xs text-stone-500">
            O preço enviado torna-se o preço oficial central (sujeito às regras fiscais SIGESC).
          </p>
          <div className="font-ui mt-4 space-y-3 text-sm">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as "service" | "product")}
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            >
              <option value="service">Serviço</option>
              <option value="product">Produto</option>
            </select>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Preço de venda central"
              type="number"
              min="0"
              step="0.01"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <Button type="submit" disabled={pending} className="w-full">
              Criar
            </Button>
          </div>
        </form>

        <form onSubmit={mapProduct} className="surface p-5">
          <h3 className="text-lg font-semibold text-ink-900">Mapear serviço operacional</h3>
          <p className="font-ui mt-1 text-xs text-stone-500">
            Metadados locais (código/etiqueta) apenas — o preço é sempre o central verificado.
          </p>
          <div className="font-ui mt-4 space-y-3 text-sm">
            <select
              value={mappingKind}
              onChange={(e) => setMappingKind(e.target.value as "SERVICE" | "PRODUCT")}
              className="h-10 w-full rounded-md border border-sand-200 bg-white px-3"
            >
              <option value="SERVICE">Serviço</option>
              <option value="PRODUCT">Produto</option>
            </select>
            <input
              required
              value={localCode}
              onChange={(e) => setLocalCode(e.target.value)}
              placeholder="Código local"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              required
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder="Etiqueta local"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <SearchableSelect
              required
              options={productOptions}
              value={centralProductId}
              onChange={(val) => {
                setCentralProductId(val);
                const found = products.find((p) => String(p.id) === val);
                if (found?.kind?.toLowerCase() === "product") setMappingKind("PRODUCT");
                else if (found?.kind?.toLowerCase() === "service") setMappingKind("SERVICE");
              }}
              labels={{
                placeholder: "Produto central SIGESC",
                searchPlaceholder: "Nome, código, ID…",
                empty: "Pesquise o catálogo acima primeiro",
              }}
              clearable={false}
            />
            <Button type="submit" disabled={pending || !centralProductId} className="w-full">
              Guardar mapeamento
            </Button>
          </div>
        </form>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Mapeamentos</h2>
        <div className="surface overflow-hidden">
          {mappings.length === 0 ? (
            <p className="font-ui p-5 text-sm text-stone-500">Nenhum mapeamento ainda.</p>
          ) : (
            <table className="font-ui w-full text-left text-sm">
              <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Local</th>
                  <th className="px-4 py-3">Preço central</th>
                  <th className="px-4 py-3">Verificação</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-sand-100 ${m.active ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{m.localLabel}</div>
                      <div className="text-xs text-stone-500">
                        {m.localCode} → #{m.centralProductId} {m.centralName}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.centralSalePrice != null ? (
                        <>
                          {m.centralSalePrice}
                          <span className="ml-1 text-xs text-stone-400">SIGESC</span>
                        </>
                      ) : (
                        <span className="text-amber-700">Não verificado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500">
                      {m.priceFresh
                        ? `Verificado ${m.centralPriceVerifiedAt ?? ""}`
                        : "Cache pode estar desactualizado"}
                      {m.legacyHistoricalPrice != null ? (
                        <div className="text-stone-400">
                          Histórico Phase 4 (não autoritativo): {m.legacyHistoricalPrice}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.active ? (
                        <span className="text-teal-800">Activo</span>
                      ) : (
                        <span className="text-stone-500">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => refreshPrice(m.id)}
                        >
                          Actualizar preço
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => toggleMappingActive(m.id, !m.active)}
                        >
                          {m.active ? "Desactivar" : "Reactivar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
