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
  description?: string | null;
  unit_of_measure?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  tax_percent?: number | null;
  is_sellable?: boolean | null;
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

type PaginationMeta = {
  current_page?: number;
  per_page?: number;
  total?: number;
  last_page?: number;
};

export function ProductsClient({
  initialProducts,
  initialPagination,
  mappings: initialMappings,
}: {
  initialProducts: Product[];
  initialPagination?: PaginationMeta;
  mappings: Mapping[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState("service");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(initialPagination?.current_page ?? 1);
  const [meta, setMeta] = useState<PaginationMeta | undefined>(initialPagination);
  const [products, setProducts] = useState(initialProducts);
  const [mappings, setMappings] = useState(initialMappings);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [localCode, setLocalCode] = useState("accommodation");
  const [localLabel, setLocalLabel] = useState("Alojamento");
  const [mappingKind, setMappingKind] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [centralProductId, setCentralProductId] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newTax, setNewTax] = useState("");
  const [newKind, setNewKind] = useState<"service" | "product">("service");

  // Edit / price-change form state
  const [editing, setEditing] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editPurchasePrice, setEditPurchasePrice] = useState("");
  const [editTax, setEditTax] = useState("");
  const [editKind, setEditKind] = useState<"service" | "product">("service");
  const [editUnit, setEditUnit] = useState("");
  const [editSellable, setEditSellable] = useState(true);
  const [editDescription, setEditDescription] = useState("");

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

  function loadPage(nextPage: number, nextKind = kind, nextQuery = q) {
    setError(null);
    startTransition(async () => {
      const params = new URLSearchParams({
        kind: nextKind,
        page: String(nextPage),
        per_page: "25",
      });
      if (nextQuery.trim()) params.set("search", nextQuery.trim());
      const res = await fetch(`/api/v1/integrations/sigesc/products?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setProducts(data.data ?? []);
      setMeta(data.meta?.pagination);
      setPage(data.meta?.pagination?.current_page ?? nextPage);
    });
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    loadPage(1, kind, q);
  }

  function startEdit(p: Product) {
    setError(null);
    setInfo(null);
    setEditing(p);
    setEditName(p.name ?? "");
    setEditPrice(p.sale_price != null ? String(p.sale_price) : "");
    setEditPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : "");
    setEditTax(p.tax_percent != null ? String(p.tax_percent) : "");
    setEditKind(p.kind?.toLowerCase() === "product" ? "product" : "service");
    setEditUnit(p.unit_of_measure ?? "");
    setEditSellable(p.is_sellable !== false);
    setEditDescription(p.description ?? "");
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setInfo(null);
    const payload: Record<string, unknown> = {
      name: editName.trim(),
      kind: editKind,
      is_sellable: editSellable,
      unit_of_measure: editUnit.trim() || null,
      description: editDescription.trim() || null,
    };
    if (editPrice !== "") payload.sale_price = Number(editPrice);
    if (editPurchasePrice !== "") payload.purchase_price = Number(editPurchasePrice);
    if (editTax !== "") payload.tax_percent = Number(editTax);

    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/products/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar produto/preço no SIGESC");
        return;
      }
      const updated = (data.product ?? {}) as Product;
      const verifiedAt = new Date().toISOString();
      setProducts((prev) =>
        prev.map((p) => (p.id === editing.id ? { ...p, ...updated } : p)),
      );
      setMappings((prev) =>
        prev.map((m) =>
          m.centralProductId === String(editing.id)
            ? {
                ...m,
                centralName: updated.name ?? m.centralName,
                centralSalePrice:
                  updated.sale_price != null ? Number(updated.sale_price) : m.centralSalePrice,
                centralTaxPercent:
                  updated.tax_percent != null ? Number(updated.tax_percent) : m.centralTaxPercent,
                centralPriceVerifiedAt: verifiedAt,
                priceFresh: true,
              }
            : m,
        ),
      );
      const count = Number(data.updatedMappingsCount ?? 0);
      setEditing(null);
      setInfo(
        `Produto #${editing.id} actualizado no SIGESC (preço: ${updated.sale_price ?? "—"} AOA · IVA: ${updated.tax_percent ?? "—"}%).${count > 0 ? ` ${count} mapeamento(s) local(is) sincronizado(s) de imediato.` : ""}`,
      );
      router.refresh();
    });
  }

  function mapProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
      setInfo(`Mapeamento "${m.localCode}" guardado com preço central verificado.`);
      router.refresh();
    });
  }

  function refreshPrice(id: string) {
    setError(null);
    setInfo(null);
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
      setInfo(`Preço central actualizado (${m.centralSalePrice} AOA).`);
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
    setInfo(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          kind: newKind,
          sale_price: newPrice ? Number(newPrice) : 0,
          ...(newTax !== "" ? { tax_percent: Number(newTax) } : {}),
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
      setNewTax("");
      setInfo(`Produto/serviço #${data.product?.id} criado no SIGESC Central.`);
    });
  }

  const currentPage = meta?.current_page ?? page;
  const lastPage = meta?.last_page ?? 1;

  return (
    <div className="space-y-8">
      {error ? <p className="font-ui text-sm text-red-700">{error}</p> : null}
      {info ? <p className="font-ui text-sm text-teal-800">{info}</p> : null}

      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm text-ink-900">
          O preço oficial vem exclusivamente do <strong>SIGESC Central</strong>. Alterações de
          preço aqui actualizam directamente o SIGESC e sincronizam imediatamente todos os
          mapeamentos locais associados.
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

        {editing ? (
          <form onSubmit={saveEdit} className="surface mb-4 border-l-4 border-l-teal-600 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-ink-900">
                Editar produto / alterar preço #{editing.id}
              </h3>
              <button
                type="button"
                className="font-ui text-xs text-stone-500 underline"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </div>
            <p className="font-ui mt-1 text-xs text-stone-500">
              Actualiza no SIGESC Central e propaga imediatamente para o cache de mapeamentos locais.
            </p>
            <div className="font-ui mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="text-xs text-stone-500">Nome *</span>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
                />
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">Preço de venda central (AOA)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
                />
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">IVA (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={editTax}
                  onChange={(e) => setEditTax(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
                />
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">Tipo</span>
                <select
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as "service" | "product")}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                >
                  <option value="service">Serviço</option>
                  <option value="product">Produto</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">Preço de custo (opcional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPurchasePrice}
                  onChange={(e) => setEditPurchasePrice(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
                />
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">Unidade</span>
                <input
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="UN, NOITE, HORA…"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={editSellable}
                  onChange={(e) => setEditSellable(e.target.checked)}
                />
                Vendável (is_sellable)
              </label>
            </div>
            <input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              className="font-ui mt-3 h-10 w-full rounded-md border border-sand-200 px-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "A guardar…" : "Guardar no SIGESC"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="surface overflow-hidden">
          <table className="font-ui w-full text-left text-sm">
            <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Preço central</th>
                <th className="px-4 py-3">IVA %</th>
                <th className="px-4 py-3">Acção</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-sand-100">
                  <td className="px-4 py-3 text-stone-500">{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{p.name}</div>
                    {p.code ? <div className="text-xs text-stone-500">{p.code}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {p.kind === "product" ? "Produto" : "Serviço"}
                  </td>
                  <td className="px-4 py-3">
                    {p.sale_price ?? "—"}
                    <span className="ml-1 text-xs text-stone-400">SIGESC</span>
                  </td>
                  <td className="px-4 py-3">{p.tax_percent ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => startEdit(p)}
                    >
                      Editar / Preço
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div className="font-ui mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <span>
              Página {currentPage} de {lastPage} · {meta.total ?? products.length} total
            </span>
            {lastPage > 1 ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || currentPage <= 1}
                  onClick={() => loadPage(currentPage - 1)}
                >
                  ← Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || currentPage >= lastPage}
                  onClick={() => loadPage(currentPage + 1)}
                >
                  Próxima →
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
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
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Preço de venda central"
                type="number"
                min="0"
                step="0.01"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={newTax}
                onChange={(e) => setNewTax(e.target.value)}
                placeholder="IVA % (opcional)"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
            </div>
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
                          <span className="ml-1 text-xs text-stone-400">
                            SIGESC{m.centralTaxPercent != null ? ` · IVA ${m.centralTaxPercent}%` : ""}
                          </span>
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
