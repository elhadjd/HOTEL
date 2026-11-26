"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Check,
  CheckSquare,
  Download,
  Edit3,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Product = {
  id: number;
  name: string;
  code?: string | null;
  barcode?: string | null;
  reference?: string | null;
  kind?: string | null;
  description?: string | null;
  unit_of_measure?: string | null;
  pricing_mode?: string | null;
  sale_price?: number | null;
  sale_price_ex_tax?: number | null;
  purchase_price?: number | null;
  purchase_price_ex_tax?: number | null;
  average_price?: number | null;
  tax_percent?: number | null;
  tax_exception_code?: string | null;
  tax_exception_reason?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  manufacturer?: string | null;
  min_quantity?: number | null;
  inventory?: boolean | null;
  allow_backorder?: boolean | null;
  is_sellable?: boolean | null;
  image?: string | null;
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

type ProductFormState = {
  name: string;
  kind: "service" | "product";
  code: string;
  barcode: string;
  reference: string;
  category_id: string;
  manufacturer: string;
  description: string;
  status: "active" | "inactive";
  sale_price: string;
  sale_price_ex_tax: string;
  purchase_price: string;
  purchase_price_ex_tax: string;
  average_price: string;
  tax_percent: string;
  tax_exception_code: string;
  tax_exception_reason: string;
  unit_of_measure: string;
  pricing_mode: "unit" | "weight";
  min_quantity: string;
  is_sellable: boolean;
  inventory: boolean;
  allow_backorder: boolean;
  image: string;
  importToHotel: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: "",
  kind: "service",
  code: "",
  barcode: "",
  reference: "",
  category_id: "",
  manufacturer: "",
  description: "",
  status: "active",
  sale_price: "",
  sale_price_ex_tax: "",
  purchase_price: "",
  purchase_price_ex_tax: "",
  average_price: "",
  tax_percent: "14",
  tax_exception_code: "",
  tax_exception_reason: "",
  unit_of_measure: "un",
  pricing_mode: "unit",
  min_quantity: "",
  is_sellable: true,
  inventory: false,
  allow_backorder: false,
  image: "",
  importToHotel: true,
};

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} AOA`;
}

function productToForm(p: Product): ProductFormState {
  const isProd = (p.kind ?? "").toLowerCase() === "product";
  return {
    name: p.name ?? "",
    kind: isProd ? "product" : "service",
    code: p.code ?? "",
    barcode: p.barcode ?? "",
    reference: p.reference ?? "",
    category_id: p.category_id != null ? String(p.category_id) : "",
    manufacturer: p.manufacturer ?? "",
    description: p.description ?? "",
    status: p.status === false || p.status === "inactive" ? "inactive" : "active",
    sale_price: p.sale_price != null ? String(p.sale_price) : "",
    sale_price_ex_tax: p.sale_price_ex_tax != null ? String(p.sale_price_ex_tax) : "",
    purchase_price: p.purchase_price != null ? String(p.purchase_price) : "",
    purchase_price_ex_tax: p.purchase_price_ex_tax != null ? String(p.purchase_price_ex_tax) : "",
    average_price: p.average_price != null ? String(p.average_price) : "",
    tax_percent: p.tax_percent != null ? String(p.tax_percent) : "",
    tax_exception_code: p.tax_exception_code ?? "",
    tax_exception_reason: p.tax_exception_reason ?? "",
    unit_of_measure: p.unit_of_measure ?? (isProd ? "un" : "noite"),
    pricing_mode: p.pricing_mode === "weight" ? "weight" : "unit",
    min_quantity: p.min_quantity != null ? String(p.min_quantity) : "",
    is_sellable: p.is_sellable !== false,
    inventory: p.inventory === true,
    allow_backorder: p.allow_backorder === true,
    image: p.image ?? "",
    importToHotel: true,
  };
}

function buildProductPayload(form: ProductFormState, includeImportFlag: boolean) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    kind: form.kind,
    status: form.status,
    is_sellable: form.is_sellable,
    inventory: form.kind === "product" ? form.inventory : false,
    allow_backorder: form.kind === "product" ? form.allow_backorder : false,
    pricing_mode: form.pricing_mode,
  };

  if (form.code.trim()) payload.code = form.code.trim();
  if (form.barcode.trim()) payload.barcode = form.barcode.trim();
  if (form.reference.trim()) payload.reference = form.reference.trim();
  if (form.manufacturer.trim()) payload.manufacturer = form.manufacturer.trim();
  if (form.description.trim()) payload.description = form.description.trim();
  if (form.unit_of_measure.trim()) payload.unit_of_measure = form.unit_of_measure.trim();
  if (form.image.trim()) payload.image = form.image.trim();
  if (form.tax_exception_code.trim()) payload.tax_exception_code = form.tax_exception_code.trim();
  if (form.tax_exception_reason.trim()) payload.tax_exception_reason = form.tax_exception_reason.trim();

  const catId = parseOptionalNumber(form.category_id);
  if (catId != null && catId > 0) payload.category_id = Math.trunc(catId);

  const salePrice = parseOptionalNumber(form.sale_price);
  if (salePrice != null) payload.sale_price = salePrice;
  const saleExTax = parseOptionalNumber(form.sale_price_ex_tax);
  if (saleExTax != null) payload.sale_price_ex_tax = saleExTax;
  const purchasePrice = parseOptionalNumber(form.purchase_price);
  if (purchasePrice != null) payload.purchase_price = purchasePrice;
  const purchaseExTax = parseOptionalNumber(form.purchase_price_ex_tax);
  if (purchaseExTax != null) payload.purchase_price_ex_tax = purchaseExTax;
  const avgPrice = parseOptionalNumber(form.average_price);
  if (avgPrice != null) payload.average_price = avgPrice;
  const taxPct = parseOptionalNumber(form.tax_percent);
  if (taxPct != null) payload.tax_percent = taxPct;
  const minQty = parseOptionalNumber(form.min_quantity);
  if (minQty != null) payload.min_quantity = minQty;

  if (includeImportFlag) {
    payload.importToHotel = form.importToHotel;
  }

  return payload;
}

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
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(initialPagination?.current_page ?? 1);
  const [meta, setMeta] = useState<PaginationMeta | undefined>(initialPagination);
  const [products, setProducts] = useState(initialProducts);
  const [mappings, setMappings] = useState(initialMappings);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Manual code mapping form (e.g. accommodation, minibar)
  const [showCustomMapping, setShowCustomMapping] = useState(false);
  const [localCode, setLocalCode] = useState("accommodation");
  const [localLabel, setLocalLabel] = useState("Alojamento");
  const [mappingKind, setMappingKind] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [centralProductId, setCentralProductId] = useState("");

  // Full Create / Edit Drawer state
  const [drawerMode, setDrawerMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);

  const importedCentralIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of mappings) {
      if (m.active) set.add(m.centralProductId);
    }
    return set;
  }, [mappings]);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: p.name,
        keywords: [String(p.id), p.code ?? "", p.barcode ?? "", p.kind ?? ""],
        description:
          p.sale_price != null
            ? `#${p.id}${p.code ? ` · ${p.code}` : ""} · ${money(p.sale_price)}`
            : `#${p.id}${p.code ? ` · ${p.code}` : ""}`,
      })),
    [products],
  );

  const pageIds = useMemo(() => products.map((p) => p.id), [products]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAllPage() {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  async function reloadMappings() {
    const res = await fetch("/api/v1/integrations/sigesc/catalog-mappings?take=200");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.mappings)) {
      setMappings(
        data.mappings.map((m: Record<string, unknown>) => ({
          id: String(m.id),
          localCode: String(m.localCode),
          localLabel: String(m.localLabel),
          centralProductId: String(m.centralProductId),
          centralName: (m.centralName as string | null) ?? null,
          centralSalePrice: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
          centralTaxPercent: m.centralTaxPercent != null ? Number(m.centralTaxPercent) : null,
          centralPriceVerifiedAt: (m.centralPriceVerifiedAt as string | null) ?? null,
          legacyHistoricalPrice:
            m.legacyHistoricalPrice != null ? Number(m.legacyHistoricalPrice) : null,
          active: m.active !== false,
          priceFresh: true,
        })),
      );
    }
  }

  function loadPage(nextPage: number, nextKind = kind, nextQuery = q) {
    setError(null);
    startTransition(async () => {
      const params = new URLSearchParams({
        page: String(nextPage),
        per_page: "25",
      });
      if (nextKind && nextKind !== "all") params.set("kind", nextKind);
      if (nextQuery.trim()) params.set("search", nextQuery.trim());
      const res = await fetch(`/api/v1/integrations/sigesc/products?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao pesquisar catálogo central");
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

  function runImport(
    payload:
      | { mode: "single"; productId: number }
      | { mode: "selected"; productIds: number[] }
      | { mode: "all"; kind?: "all" | "product" | "service" },
  ) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/catalog-mappings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao importar produtos");
        return;
      }
      const parts: string[] = [];
      if (data.imported) parts.push(`${data.imported} novo(s) importado(s)`);
      if (data.updated) parts.push(`${data.updated} actualizado(s)`);
      if (data.skipped) parts.push(`${data.skipped} ignorado(s) sem preço`);
      if (data.failed) parts.push(`${data.failed} com erro`);
      setInfo(
        parts.length > 0
          ? `Importação concluída: ${parts.join(" · ")}. Já disponíveis nos selects do hotel.`
          : "Nenhum produto novo para importar.",
      );
      if (payload.mode === "selected") {
        setSelectedIds([]);
      }
      await reloadMappings();
      router.refresh();
    });
  }

  function openCreateDrawer(defaultKind: "service" | "product" = "service") {
    setError(null);
    setInfo(null);
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      kind: defaultKind,
      unit_of_measure: defaultKind === "service" ? "noite" : "un",
      inventory: defaultKind === "product",
    });
    setDrawerMode("create");
  }

  function openEditDrawer(p: Product) {
    setError(null);
    setInfo(null);
    setEditingId(p.id);
    setForm(productToForm(p));
    setDrawerMode("edit");
  }

  function submitDrawer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!form.name.trim()) {
      setError("O nome do produto/serviço é obrigatório.");
      return;
    }

    startTransition(async () => {
      if (drawerMode === "create") {
        const res = await fetch("/api/v1/integrations/sigesc/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildProductPayload(form, true)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao criar produto no servidor central");
          return;
        }
        if (data.product) {
          setProducts((prev) => [data.product as Product, ...prev]);
        }
        setInfo(
          form.importToHotel
            ? `Item "${data.product?.name ?? form.name}" criado no servidor central e disponibilizado nos selects do hotel.`
            : `Item "${data.product?.name ?? form.name}" criado no servidor central.`,
        );
        setDrawerMode("closed");
        await reloadMappings();
        router.refresh();
        return;
      }

      if (drawerMode === "edit" && editingId != null) {
        const res = await fetch(`/api/v1/integrations/sigesc/products/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildProductPayload(form, false)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao actualizar produto no servidor central");
          return;
        }
        const updated = data.product as Product | undefined;
        if (updated) {
          setProducts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        }
        setInfo(
          `Item "${updated?.name ?? form.name}" actualizado (${money(updated?.sale_price)}).${
            data.updatedMappingsCount
              ? ` ${data.updatedMappingsCount} ligação(ões) no hotel sincronizada(s).`
              : ""
          }`,
        );
        setDrawerMode("closed");
        await reloadMappings();
        router.refresh();
      }
    });
  }

  function saveCustomMapping(e: React.FormEvent) {
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
        setError(data.error ?? "Falha ao guardar mapeamento");
        return;
      }
      setInfo(`Mapeamento "${localCode}" guardado com preço central verificado.`);
      setShowCustomMapping(false);
      await reloadMappings();
      router.refresh();
    });
  }

  function refreshPrice(mappingId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings/${mappingId}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Falha ao actualizar preço");
        return;
      }
      setInfo("Preço sincronizado com o sistema central.");
      await reloadMappings();
      router.refresh();
    });
  }

  function removeMapping(mappingId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings/${mappingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Falha ao remover ligação");
        return;
      }
      setMappings((prev) => prev.filter((m) => m.id !== mappingId));
      setInfo("Item removido dos selects do hotel (mantido no servidor central).");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-lg border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {info}
        </div>
      ) : null}

      {/* Top action bar */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Catálogo do Sistema Central</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              Importe todos os itens, vários selecionados ou um por um para aparecerem nos selects de
              consumo e faturação do hotel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                runImport({
                  mode: "all",
                  kind: kind === "product" || kind === "service" ? kind : "all",
                })
              }
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Importar todos ({kind === "all" ? "catálogo completo" : kind === "service" ? "serviços" : "produtos"})
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => openCreateDrawer("service")}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo produto / serviço
            </Button>
          </div>
        </div>

        {/* Search & kind filter */}
        <form onSubmit={search} className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar por nome, código SKU ou código de barras…"
              className="h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm outline-none ring-teal-500/30 focus:ring-2"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              loadPage(1, e.target.value, q);
            }}
            className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
          >
            <option value="all">Todos (Produtos + Serviços)</option>
            <option value="service">Apenas Serviços</option>
            <option value="product">Apenas Produtos</option>
          </select>
          <Button type="submit" variant="secondary" disabled={pending}>
            Pesquisar
          </Button>
        </form>

        {/* Multi-selection batch bar */}
        {selectedIds.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-500/30 bg-teal-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
              <CheckSquare className="h-4 w-4 text-teal-700" />
              <span>
                {selectedIds.length} {selectedIds.length === 1 ? "item selecionado" : "itens selecionados"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => runImport({ mode: "selected", productIds: selectedIds })}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Importar selecionados ({selectedIds.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
              >
                Limpar seleção
              </Button>
            </div>
          </div>
        ) : null}

        {/* Catalog table */}
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="Selecionar todos desta página"
                    className="h-4 w-4 rounded border-sand-200 accent-teal-600"
                  />
                </th>
                <th>Produto / Serviço</th>
                <th>Tipo / Unidade</th>
                <th>Preço venda</th>
                <th>IVA</th>
                <th>Estado no Hotel</th>
                <th className="text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-stone-500">
                    Nenhum produto ou serviço encontrado no catálogo central.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isImported = importedCentralIds.has(String(p.id));
                  const isSelected = selectedIds.includes(p.id);
                  const isProduct = (p.kind ?? "").toLowerCase() === "product";
                  return (
                    <tr key={p.id} className={isSelected ? "bg-teal-50/50" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Selecionar ${p.name}`}
                          className="h-4 w-4 rounded border-sand-200 accent-teal-600"
                        />
                      </td>
                      <td>
                        <div className="font-medium text-ink-900">{p.name}</div>
                        <div className="font-mono text-xs text-stone-500">
                          #{p.id}
                          {p.code ? ` · ${p.code}` : ""}
                          {p.barcode ? ` · EAN ${p.barcode}` : ""}
                          {p.category_name ? ` · ${p.category_name}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                          {isProduct ? (
                            <Package className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {isProduct ? "Produto" : "Serviço"}
                        </span>
                        {p.unit_of_measure ? (
                          <span className="ml-1.5 text-xs text-stone-500">{p.unit_of_measure}</span>
                        ) : null}
                      </td>
                      <td className="font-medium tabular-nums text-ink-900">
                        {money(p.sale_price)}
                        {p.purchase_price != null ? (
                          <div className="text-xs font-normal text-stone-500">
                            Custo {money(p.purchase_price)}
                          </div>
                        ) : null}
                      </td>
                      <td className="tabular-nums text-stone-700">
                        {p.tax_percent != null ? `${p.tax_percent}%` : "0%"}
                      </td>
                      <td>
                        {isImported ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            <Check className="h-3 w-3" />
                            Nos selects do hotel
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">Não importado</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={isImported ? "ghost" : "secondary"}
                            disabled={pending}
                            onClick={() => runImport({ mode: "single", productId: p.id })}
                            className="gap-1"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {isImported ? "Actualizar" : "Importar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => openEditDrawer(p)}
                            className="gap-1"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && (meta.last_page ?? 1) > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-3 text-sm">
            <span className="text-stone-500">
              Página {page} de {meta.last_page} · {meta.total ?? products.length} itens no servidor central
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || page <= 1}
                onClick={() => loadPage(page - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || page >= (meta.last_page ?? 1)}
                onClick={() => loadPage(page + 1)}
              >
                Seguinte
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Imported hotel selects / mappings */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              Itens disponíveis nos Selects do Hotel ({mappings.length})
            </h2>
            <p className="mt-0.5 text-sm text-stone-500">
              Todos os produtos e serviços abaixo estão prontos para lançar em consumos de estadia,
              cotações e faturas.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowCustomMapping((v) => !v)}
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            {showCustomMapping ? "Fechar mapeamento avançado" : "Mapear código especial (ex. alojamento)"}
          </Button>
        </div>

        {showCustomMapping ? (
          <form
            onSubmit={saveCustomMapping}
            className="surface-muted mt-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5"
          >
            <input
              required
              value={localCode}
              onChange={(e) => setLocalCode(e.target.value)}
              placeholder="Código local (ex. accommodation)"
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
            <input
              required
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder="Etiqueta local"
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
            <select
              value={mappingKind}
              onChange={(e) => setMappingKind(e.target.value as "SERVICE" | "PRODUCT")}
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            >
              <option value="SERVICE">Serviço</option>
              <option value="PRODUCT">Produto</option>
            </select>
            <SearchableSelect
              options={productOptions}
              value={centralProductId}
              onChange={setCentralProductId}
              labels={{
                placeholder: "Produto central…",
                searchPlaceholder: "Pesquisar…",
              }}
            />
            <Button type="submit" disabled={pending || !centralProductId}>
              Guardar ligação
            </Button>
          </form>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Código / Nome no Hotel</th>
                <th>Item Central</th>
                <th>Preço verificado</th>
                <th>IVA</th>
                <th className="text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-stone-500">
                    Ainda nenhum produto importado. Clique em &ldquo;Importar todos&rdquo; acima para
                    disponibilizar o catálogo inteiro nos selects.
                  </td>
                </tr>
              ) : (
                mappings.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium text-ink-900">{m.localLabel}</div>
                      <div className="font-mono text-xs text-stone-500">{m.localCode}</div>
                    </td>
                    <td>
                      <div className="text-stone-700">{m.centralName ?? "—"}</div>
                      <div className="font-mono text-xs text-stone-500">ID #{m.centralProductId}</div>
                    </td>
                    <td className="font-medium tabular-nums">
                      {money(m.centralSalePrice)}
                      <div className="text-xs font-normal text-stone-500">
                        {m.priceFresh ? "Verificado recentemente" : "Sincronizar preço"}
                      </div>
                    </td>
                    <td className="tabular-nums">
                      {m.centralTaxPercent != null ? `${m.centralTaxPercent}%` : "0%"}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => refreshPrice(m.id)}
                          className="gap-1"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sincronizar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => removeMapping(m.id)}
                          className="text-danger hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Central Product / Service Create & Edit Drawer */}
      {drawerMode !== "closed" ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink-950/45">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
            onClick={() => setDrawerMode("closed")}
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col bg-sand-50 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-sand-200 bg-white px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Catálogo do Sistema Central
                </p>
                <h3 className="text-xl font-semibold text-ink-900">
                  {drawerMode === "create"
                    ? "Criar novo produto ou serviço"
                    : `Editar item #${editingId}`}
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDrawerMode("closed")}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={submitDrawer} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {/* Section 1: Identification */}
                <section className="surface space-y-4 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                    1. Identificação
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-stone-600">Nome do produto ou serviço *</span>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ex.: Diária Suite Deluxe / Água Mineral 1.5L"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Tipo *</span>
                      <select
                        value={form.kind}
                        onChange={(e) => {
                          const nextKind = e.target.value as "service" | "product";
                          setForm((f) => ({
                            ...f,
                            kind: nextKind,
                            inventory: nextKind === "product" ? f.inventory : false,
                            unit_of_measure:
                              f.unit_of_measure === "noite" && nextKind === "product"
                                ? "un"
                                : f.unit_of_measure === "un" && nextKind === "service"
                                  ? "noite"
                                  : f.unit_of_measure,
                          }));
                        }}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      >
                        <option value="service">Serviço (alojamento, spa, lavandaria…)</option>
                        <option value="product">Produto físico (minibar, restaurante, loja…)</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Estado</span>
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
                        }
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Código / SKU</span>
                      <input
                        value={form.code}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="Ex.: HOT-SUITE-01"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Código de barras (EAN)</span>
                      <input
                        value={form.barcode}
                        onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                        placeholder="Opcional"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Referência interna</span>
                      <input
                        value={form.reference}
                        onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                        placeholder="Gerada automaticamente se vazio"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">ID da Categoria (central)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.category_id}
                        onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                        placeholder="Opcional"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Fabricante / Marca</span>
                      <input
                        value={form.manufacturer}
                        onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                        placeholder="Opcional"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">URL da imagem</span>
                      <input
                        value={form.image}
                        onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                        placeholder="https://… (opcional)"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-stone-600">Descrição</span>
                      <textarea
                        rows={2}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Detalhes apresentados nas faturas e catálogo"
                        className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </section>

                {/* Section 2: Pricing & Taxes */}
                <section className="surface space-y-4 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                    2. Preços e Fiscalidade
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-stone-600">Preço de venda c/ IVA (AOA) *</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={form.sale_price}
                        onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Preço de venda s/ IVA (opcional)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.sale_price_ex_tax}
                        onChange={(e) => setForm((f) => ({ ...f, sale_price_ex_tax: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Preço de compra / custo (AOA)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.purchase_price}
                        onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Custo s/ IVA (opcional)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.purchase_price_ex_tax}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, purchase_price_ex_tax: e.target.value }))
                        }
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Preço médio (opcional)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.average_price}
                        onChange={(e) => setForm((f) => ({ ...f, average_price: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Taxa de IVA (%)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={form.tax_percent}
                        onChange={(e) => setForm((f) => ({ ...f, tax_percent: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm tabular-nums"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Código de isenção fiscal</span>
                      <input
                        value={form.tax_exception_code}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tax_exception_code: e.target.value }))
                        }
                        placeholder="Ex.: M04 (quando IVA = 0%)"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Motivo de isenção fiscal</span>
                      <input
                        value={form.tax_exception_reason}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tax_exception_reason: e.target.value }))
                        }
                        placeholder="Ex.: IVA - Regime de não sujeição"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                  </div>
                </section>

                {/* Section 3: Unit & Stock */}
                <section className="surface space-y-4 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                    3. Unidade e Operação
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">
                      <span className="text-stone-600">Unidade de medida</span>
                      <input
                        value={form.unit_of_measure}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, unit_of_measure: e.target.value }))
                        }
                        placeholder="un, noite, hora, kg, L"
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Modo de preço</span>
                      <select
                        value={form.pricing_mode}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            pricing_mode: e.target.value as "unit" | "weight",
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
                      >
                        <option value="unit">Por unidade</option>
                        <option value="weight">Por peso</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-stone-600">Stock mínimo</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={form.min_quantity}
                        onChange={(e) => setForm((f) => ({ ...f, min_quantity: e.target.value }))}
                        disabled={form.kind === "service"}
                        className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm disabled:opacity-50"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-5 pt-1 text-sm text-ink-900">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.is_sellable}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, is_sellable: e.target.checked }))
                        }
                        className="h-4 w-4 accent-teal-600"
                      />
                      Disponível para venda
                    </label>
                    {form.kind === "product" ? (
                      <>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.inventory}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, inventory: e.target.checked }))
                            }
                            className="h-4 w-4 accent-teal-600"
                          />
                          Controlar stock
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.allow_backorder}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, allow_backorder: e.target.checked }))
                            }
                            className="h-4 w-4 accent-teal-600"
                          />
                          Permitir venda sem stock
                        </label>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="space-y-3 border-t border-sand-200 bg-white px-6 py-4">
                {drawerMode === "create" ? (
                  <label className="flex items-center gap-2 text-sm text-ink-900">
                    <input
                      type="checkbox"
                      checked={form.importToHotel}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, importToHotel: e.target.checked }))
                      }
                      className="h-4 w-4 accent-teal-600"
                    />
                    Disponibilizar imediatamente nos selects do hotel após criar
                  </label>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDrawerMode("closed")}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending
                      ? "A guardar…"
                      : drawerMode === "create"
                        ? "Criar no servidor central"
                        : "Guardar alterações"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
