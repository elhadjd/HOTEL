"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

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
  localOperationalPrice: string | number | null;
  centralProductId: string;
  centralName: string | null;
  centralSalePrice: string | number | null;
  active: boolean;
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
  const [localPrice, setLocalPrice] = useState("");
  const [centralProductId, setCentralProductId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newKind, setNewKind] = useState<"service" | "product">("service");

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
          localOperationalPrice: localPrice ? Number(localPrice) : null,
          kind: newKind === "service" ? "SERVICE" : "PRODUCT",
          centralProductId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Mapping failed");
        return;
      }
      setMappings((prev) => {
        const rest = prev.filter((m) => m.localCode !== data.mapping.localCode);
        return [...rest, data.mapping].sort((a, b) => a.localCode.localeCompare(b.localCode));
      });
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
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Preço central</th>
                <th className="px-4 py-3">IVA %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-sand-100">
                  <td className="px-4 py-3 text-stone-500">{p.id}</td>
                  <td className="px-4 py-3 font-medium text-ink-900">{p.name}</td>
                  <td className="px-4 py-3">{p.code ?? "—"}</td>
                  <td className="px-4 py-3">{p.sale_price ?? "—"}</td>
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
            Preços oficiais e impostos são autoridade central. Regime simplificado pode forçar IVA 0%.
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
            Preço operacional local ≠ preço de catálogo central. Em faturação usa-se o product_id
            central.
          </p>
          <div className="font-ui mt-4 space-y-3 text-sm">
            <input
              required
              value={localCode}
              onChange={(e) => setLocalCode(e.target.value)}
              placeholder="Código local (ex. accommodation)"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              required
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder="Etiqueta local"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={localPrice}
              onChange={(e) => setLocalPrice(e.target.value)}
              placeholder="Preço operacional local (opcional)"
              type="number"
              min="0"
              step="0.01"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              required
              value={centralProductId}
              onChange={(e) => setCentralProductId(e.target.value)}
              placeholder="ID produto central"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <Button type="submit" disabled={pending} className="w-full">
              Guardar mapeamento
            </Button>
          </div>
        </form>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Mapeamentos activos</h2>
        <div className="surface overflow-hidden">
          {mappings.length === 0 ? (
            <p className="font-ui p-5 text-sm text-stone-500">Nenhum mapeamento ainda.</p>
          ) : (
            <table className="font-ui w-full text-left text-sm">
              <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Local</th>
                  <th className="px-4 py-3">Preço local</th>
                  <th className="px-4 py-3">Central</th>
                  <th className="px-4 py-3">Preço central</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-b border-sand-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{m.localLabel}</div>
                      <div className="text-xs text-stone-500">{m.localCode}</div>
                    </td>
                    <td className="px-4 py-3">{m.localOperationalPrice ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div>{m.centralName ?? "—"}</div>
                      <div className="text-xs text-stone-500">#{m.centralProductId}</div>
                    </td>
                    <td className="px-4 py-3">{m.centralSalePrice ?? "—"}</td>
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
