"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";

export type InvoiceRow = {
  id: string;
  externalId: string;
  orderReference: string | null;
  requestedState: string;
  status: string;
  saleKey: string | null;
  centralState: string | null;
  centralTotal: number | null;
  centralSubtotal: number | null;
  centralTax: number | null;
  currency: string;
  lastError: string | null;
  reservationId: string | null;
  stayId: string | null;
  guestId: string | null;
  hotelId: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    itemCount: number;
    totalQuantity: number;
    subtotal: number;
    discount: number;
  };
  guestLabel?: string | null;
  hotelLabel?: string | null;
};

type LineDraft = {
  key: string;
  mappingLocalCode: string;
  quantity: string;
  discount: string;
  description: string;
  unitPriceHint: number | null;
  label: string;
};

const PAGE_SIZE = 20;

function money(value: number | null | undefined, currency = "AOA") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function mapGuestOptions(
  guests: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    customerMapping?: { externalCustomerId?: string | null; syncStatus?: string } | null;
  }>,
): SearchableOption[] {
  return guests.map((g) => ({
    value: g.id,
    label: `${g.firstName} ${g.lastName}`,
    keywords: [g.email ?? "", g.phone ?? "", g.customerMapping?.externalCustomerId ?? ""],
    description:
      g.customerMapping?.syncStatus === "LINKED" ? "Cliente central ligado" : "Sem ligação",
  }));
}

function mapMappingOptions(
  mappings: Array<{
    localCode: string;
    localLabel?: string | null;
    centralName?: string | null;
    centralProductId?: string;
    centralSalePrice?: unknown;
    active?: boolean;
  }>,
): Array<SearchableOption & { unitPriceHint?: number | null }> {
  return mappings
    .filter((m) => m.active !== false)
    .map((m) => ({
      value: m.localCode,
      label: m.localLabel || m.centralName || m.localCode,
      keywords: [m.localCode, m.centralProductId ?? "", m.centralName ?? ""],
      description:
        m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
      unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
    }));
}

export function InvoicesClient({
  invoices: initial,
  total: initialTotal,
  take: initialTake = PAGE_SIZE,
  skip: initialSkip = 0,
  defaultHotelId = "",
  guests,
  reservations,
  stays,
  mappings,
  prefill,
}: {
  invoices: InvoiceRow[];
  total: number;
  take?: number;
  skip?: number;
  defaultHotelId?: string;
  guests: SearchableOption[];
  reservations: SearchableOption[];
  stays: SearchableOption[];
  mappings: Array<SearchableOption & { unitPriceHint?: number | null }>;
  prefill?: { stayId?: string; guestId?: string; hotelId?: string };
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [take] = useState(initialTake || PAGE_SIZE);
  const [skip, setSkip] = useState(initialSkip);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(Boolean(prefill?.stayId));
  const fetchGen = useRef(0);

  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [guestFilter, setGuestFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [guestId, setGuestId] = useState(prefill?.guestId ?? "");
  const [reservationId, setReservationId] = useState("");
  const [stayId, setStayId] = useState(prefill?.stayId ?? "");
  const hotelId = prefill?.hotelId || defaultHotelId;
  const [state, setState] = useState("Cotação");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productPick, setProductPick] = useState("");
  const [mappingOptions, setMappingOptions] = useState(mappings);
  const [submitNow, setSubmitNow] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadPage = useCallback(
    async (nextSkip: number, filters: {
      q: string;
      state: string;
      status: string;
      guestId: string;
      from: string;
      to: string;
    }) => {
      const gen = ++fetchGen.current;
      setListLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("take", String(take));
        params.set("skip", String(nextSkip));
        if (filters.q) params.set("q", filters.q);
        if (filters.state) params.set("state", filters.state);
        if (filters.status) params.set("status", filters.status);
        if (filters.guestId) params.set("guestId", filters.guestId);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        const res = await fetch(`/api/v1/integrations/sigesc/invoices?${params}`);
        const data = await res.json().catch(() => ({}));
        if (fetchGen.current !== gen) return;
        if (!res.ok) {
          setError(data.error ?? "Falha ao carregar documentos");
          return;
        }
        setRows(
          (data.invoices as InvoiceRow[]).map((inv) => ({
            ...inv,
            createdAt:
              typeof inv.createdAt === "string"
                ? inv.createdAt
                : new Date(inv.createdAt).toISOString(),
            updatedAt:
              typeof inv.updatedAt === "string"
                ? inv.updatedAt
                : new Date(inv.updatedAt).toISOString(),
          })),
        );
        setTotal(Number(data.total) || 0);
        setSkip(Number(data.skip) || nextSkip);
        setError(null);
      } finally {
        if (fetchGen.current === gen) setListLoading(false);
      }
    },
    [take],
  );

  useEffect(() => {
    void loadPage(0, {
      q: debouncedQ,
      state: stateFilter,
      status: statusFilter,
      guestId: guestFilter,
      from,
      to,
    });
  }, [debouncedQ, stateFilter, statusFilter, guestFilter, from, to, loadPage]);

  const pageIndex = Math.floor(skip / take);
  const pageCount = Math.max(1, Math.ceil(total / take));
  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + rows.length, total);

  const summaryCards = useMemo(() => {
    const created = rows.filter((r) => r.status === "CREATED").length;
    const drafts = rows.filter((r) => r.status === "DRAFT").length;
    const editable = rows.filter(
      (r) => r.centralState === "Cotação" || r.centralState === "Proforma",
    ).length;
    const centralTotal = rows.reduce((acc, r) => acc + (r.centralTotal ?? 0), 0);
    return { created, drafts, editable, centralTotal };
  }, [rows]);

  const liveTotals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const price = line.unitPriceHint ?? 0;
      const disc = Number(line.discount) || 0;
      subtotal += price * qty;
      discount += disc;
    }
    return {
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number((subtotal - discount).toFixed(2)),
    };
  }, [lines]);

  const searchGuests = useCallback(async (query: string): Promise<SearchableOption[]> => {
    const params = new URLSearchParams({ take: "50" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/v1/guests?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao pesquisar hóspedes");
    return mapGuestOptions(data.guests ?? []);
  }, []);

  const searchMappings = useCallback(async (query: string) => {
    const params = new URLSearchParams({ take: "50", activeOnly: "1" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao pesquisar produtos");
    const next = mapMappingOptions(data.mappings ?? []);
    setMappingOptions((prev) => {
      const byValue = new Map(prev.map((m) => [m.value, m]));
      for (const m of next) byValue.set(m.value, m);
      return [...byValue.values()];
    });
    return next;
  }, []);

  function addProductLine() {
    const mapping =
      mappingOptions.find((m) => m.value === productPick) ??
      mappings.find((m) => m.value === productPick);
    if (!mapping) return;
    setLines((prev) => [
      ...prev,
      {
        key: `${mapping.value}-${Date.now()}`,
        mappingLocalCode: mapping.value,
        quantity: "1",
        discount: "0",
        description: "",
        unitPriceHint: mapping.unitPriceHint ?? null,
        label: mapping.label,
      },
    ]);
    setProductPick("");
  }

  function createDraft(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!lines.length) {
      setError("Adicione pelo menos um produto.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guestId || undefined,
          reservationId: reservationId || undefined,
          stayId: stayId || undefined,
          hotelId: hotelId || undefined,
          state,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            mappingLocalCode: l.mappingLocalCode,
            quantity: Number(l.quantity) || 1,
            discount: Number(l.discount) || 0,
            description: l.description || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar rascunho");
        return;
      }
      const createdId = data.invoice.id as string;
      if (submitNow) {
        const subRes = await fetch(`/api/v1/integrations/sigesc/invoices/${createdId}/submit`, {
          method: "POST",
        });
        const subData = await subRes.json().catch(() => ({}));
        if (!subRes.ok) {
          setError(
            `Rascunho criado localmente, mas o envio ao sistema central falhou: ${subData.error ?? "erro remoto"}`,
          );
          setCreateOpen(false);
          setLines([]);
          router.refresh();
          router.push(`/integrations/invoices/${createdId}`);
          return;
        }
        if (subData.reconciliationRequired || subData.invoice?.status === "RECONCILIATION_REQUIRED") {
          setError(
            subData.warning ??
              "Rascunho aguarda reconciliação com o sistema central.",
          );
        } else {
          const officialNo = subData.invoice?.orderReference || subData.invoice?.saleKey || "";
          setMessage(
            `Documento ${officialNo} criado e numerado pelo sistema central com sucesso.`,
          );
        }
      } else {
        setMessage("Rascunho criado localmente. Envie ao sistema central para gerar o número oficial.");
      }
      setCreateOpen(false);
      setLines([]);
      router.refresh();
      router.push(`/integrations/invoices/${createdId}`);
    });
  }

  function clearFilters() {
    setQ("");
    setDebouncedQ("");
    setStateFilter("");
    setStatusFilter("");
    setGuestFilter("");
    setFrom("");
    setTo("");
  }

  function goPage(delta: number) {
    const nextSkip = Math.max(0, skip + delta * take);
    if (nextSkip === skip) return;
    if (nextSkip >= total && total > 0) return;
    void loadPage(nextSkip, {
      q: debouncedQ,
      state: stateFilter,
      status: statusFilter,
      guestId: guestFilter,
      from,
      to,
    });
  }

  return (
    <div className="space-y-6">
      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm text-ink-900">
          Crie <strong>Cotações</strong> ou <strong>Proformas</strong> com numeração oficial gerada
          pelo <strong>sistema central</strong>, e publique ou liquide (pagamento total/parcial)
          diretamente no detalhe do documento. Os preços de linha são sempre validados no catálogo
          central.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">Documentos</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{total}</p>
          <p className="font-ui text-xs text-stone-500">
            {listLoading ? "A actualizar…" : `a mostrar ${pageFrom}–${pageTo}`}
          </p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">No Sistema Central</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{summaryCards.created}</p>
          <p className="font-ui text-xs text-stone-500">
            {summaryCards.editable} editáveis · nesta página
          </p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">Rascunhos locais</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{summaryCards.drafts}</p>
          <p className="font-ui text-xs text-stone-500">nesta página</p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">
            Totais centrais
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">
            {money(summaryCards.centralTotal)}
          </p>
          <p className="font-ui text-xs text-stone-500">Valores oficiais · nesta página</p>
        </div>
      </div>

      <div className="surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">Documentos financeiros</h3>
            <p className="font-ui text-xs text-stone-500">
              Pesquisa por número oficial da fatura, hóspede ou período.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMessage(null);
                startTransition(async () => {
                  const res = await fetch("/api/v1/integrations/sigesc/invoices/sync", {
                    method: "POST",
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error ?? "Falha ao sincronizar estados no sistema central");
                    return;
                  }
                  setMessage(
                    `Estados sincronizados: ${data.checked} verificados, ${data.updated} actualizados${data.failed ? `, ${data.failed} com falha` : ""}.`,
                  );
                  router.refresh();
                });
              }}
            >
              Sincronizar estados
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova cotação / proforma
            </Button>
          </div>
        </div>

        <div className="font-ui mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block xl:col-span-2">
            <span className="text-xs text-stone-500">Pesquisar</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nº fatura (ex. FT/PP…), hóspede, referência…"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Tipo</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="Cotação">Cotação</option>
              <option value="Proforma">Proforma</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Estado de envio</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="PENDING_SUBMISSION">Pendente</option>
              <option value="SUBMITTING">A enviar</option>
              <option value="CREATED">Sincronizado</option>
              <option value="RECONCILIATION_REQUIRED">Reconciliação</option>
              <option value="FAILED_VALIDATION">Erro de validação</option>
              <option value="FAILED_FINAL">Falha definitiva</option>
            </select>
          </label>
          <div className="block">
            <span className="text-xs text-stone-500">Hóspede</span>
            <SearchableSelect
              options={guests}
              value={guestFilter}
              onChange={setGuestFilter}
              onSearch={searchGuests}
              labels={{
                placeholder: "Todos",
                searchPlaceholder: "Nome, email…",
                refineSearch: "Mais de 50 hóspedes — refine a pesquisa.",
              }}
              className="mt-1"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-xs text-stone-500">De</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
              />
            </label>
            <label className="block flex-1">
              <span className="text-xs text-stone-500">Até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
              />
            </label>
          </div>
        </div>
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Sem documentos"
            description="Crie uma cotação/proforma ou ajuste os filtros."
          />
        ) : (
          <>
            <div className="divide-y divide-sand-100 md:hidden">
              {rows.map((inv) => {
                const officialNumber =
                  inv.orderReference &&
                  !inv.orderReference.startsWith("HOT-INV-") &&
                  !inv.orderReference.startsWith("API-HOT-INV-")
                    ? inv.orderReference
                    : null;
                return (
                  <div key={inv.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {officialNumber ? (
                          <div className="font-mono text-sm font-semibold text-ink-900">
                            {officialNumber}
                          </div>
                        ) : (
                          <div className="font-medium text-stone-600">Rascunho local</div>
                        )}
                        <div className="truncate text-xs text-stone-500">
                          {inv.guestLabel ?? "Sem hóspede"} · {inv.saleKey ?? "não enviado"}
                        </div>
                      </div>
                      <Link
                        href={`/integrations/invoices/${inv.id}`}
                        className="inline-flex h-8 shrink-0 items-center rounded-md bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-500"
                      >
                        Abrir
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <StatusPill value={inv.requestedState} />
                      <StatusPill value={inv.status} />
                      {inv.centralState ? <StatusPill value={inv.centralState} /> : null}
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-sand-50/80 px-3 py-2 text-xs tabular-nums">
                      <span className="text-stone-600">
                        {inv.summary.itemCount} item(ns) · qty {inv.summary.totalQuantity}
                      </span>
                      <span className="font-semibold text-ink-900">
                        {inv.centralTotal != null ? money(inv.centralTotal, inv.currency) : "Pendente"}
                      </span>
                    </div>
                    {inv.lastError ? (
                      <p className="text-xs text-danger">{inv.lastError}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th>Nº da Fatura</th>
                    <th>Tipo / estado</th>
                    <th>Cliente / Hóspede</th>
                    <th>Itens</th>
                    <th>Totais</th>
                    <th>Actualizado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => {
                    const officialNumber =
                      inv.orderReference &&
                      !inv.orderReference.startsWith("HOT-INV-") &&
                      !inv.orderReference.startsWith("API-HOT-INV-")
                        ? inv.orderReference
                        : null;
                    return (
                      <tr key={inv.id}>
                        <td>
                          {officialNumber ? (
                            <div className="font-mono text-sm font-semibold text-ink-900">
                              {officialNumber}
                            </div>
                          ) : (
                            <div className="font-medium text-stone-600">
                              Rascunho local
                            </div>
                          )}
                          <div className="text-xs text-stone-500">
                            {inv.saleKey ? `Ref. central ${inv.saleKey}` : "A aguardar envio ao sistema central"}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <StatusPill value={inv.requestedState} />
                            <StatusPill value={inv.status} />
                            {inv.centralState ? <StatusPill value={inv.centralState} /> : null}
                          </div>
                          {inv.lastError ? (
                            <p className="mt-1 text-xs text-danger">{inv.lastError}</p>
                          ) : null}
                        </td>
                        <td>
                          <div className="text-stone-700">{inv.guestLabel ?? "—"}</div>
                        </td>
                        <td className="tabular-nums">
                          {inv.summary.itemCount} · qty {inv.summary.totalQuantity}
                          {inv.summary.discount > 0 ? (
                            <div className="text-xs text-stone-500">
                              desc. {money(inv.summary.discount, inv.currency)}
                            </div>
                          ) : null}
                        </td>
                        <td className="tabular-nums">
                          {inv.centralTotal != null ? (
                            <>
                              <div className="font-medium">{money(inv.centralTotal, inv.currency)}</div>
                              <div className="text-xs text-stone-500">
                                Sub {money(inv.centralSubtotal, inv.currency)}
                              </div>
                            </>
                          ) : (
                            <span className="text-stone-400">Pendente</span>
                          )}
                        </td>
                        <td className="text-xs tabular-nums text-stone-500">
                          {new Date(inv.updatedAt).toLocaleString("pt-PT")}
                        </td>
                        <td>
                          <Link
                            href={`/integrations/invoices/${inv.id}`}
                            className="font-medium text-teal-700 hover:underline"
                          >
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="font-ui flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 px-4 py-3 text-sm">
              <p className="text-stone-500">
                Página {pageIndex + 1} de {pageCount} · {total} resultado{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={listLoading || skip <= 0}
                  onClick={() => goPage(-1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={listLoading || skip + take >= total}
                  onClick={() => goPage(1)}
                  className="gap-1"
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink-950/45">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-xl flex-col bg-sand-50 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-sand-200 px-5 py-4">
              <div>
                <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
                  Novo documento
                </p>
                <h3 className="text-xl font-semibold text-ink-900">Cotação / Proforma</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCreateOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={createDraft} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <section className="space-y-3">
                  <h4 className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    A — Cliente e contexto
                  </h4>
                  <div className="block text-sm">
                    <span className="text-stone-500">Hóspede (cliente central ligado)</span>
                    <SearchableSelect
                      className="mt-1"
                      options={guests}
                      value={guestId}
                      onChange={setGuestId}
                      onSearch={searchGuests}
                      labels={{
                        placeholder: "Seleccionar hóspede",
                        searchPlaceholder: "Nome, email, telefone…",
                        refineSearch: "Mais resultados existem — refine a pesquisa.",
                      }}
                    />
                  </div>
                  <div className="block text-sm">
                    <span className="text-stone-500">Estadia activa</span>
                    <SearchableSelect
                      className="mt-1"
                      options={stays}
                      value={stayId}
                      onChange={setStayId}
                      labels={{ placeholder: "Opcional", searchPlaceholder: "Estadia…" }}
                    />
                  </div>
                  <div className="block text-sm">
                    <span className="text-stone-500">Reserva</span>
                    <SearchableSelect
                      className="mt-1"
                      options={reservations}
                      value={reservationId}
                      onChange={setReservationId}
                      labels={{ placeholder: "Opcional", searchPlaceholder: "Código…" }}
                    />
                  </div>
                  <label className="block text-sm">
                    <span className="text-stone-500">Tipo de documento</span>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                    >
                      <option value="Cotação">Cotação</option>
                      <option value="Proforma">Proforma</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-stone-500">Notas</span>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                    />
                  </label>
                </section>

                <section className="space-y-3">
                  <h4 className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    B — Produtos centrais
                  </h4>
                  <div className="flex gap-2">
                    <SearchableSelect
                      className="flex-1"
                      options={mappingOptions}
                      value={productPick}
                      onChange={setProductPick}
                      onSearch={searchMappings}
                      labels={{
                        placeholder: "Pesquisar produto / SKU",
                        searchPlaceholder: "Nome, código, SKU…",
                        empty: "Configure mapeamentos de catálogo",
                        refineSearch: "Catálogo grande — refine a pesquisa no servidor.",
                      }}
                    />
                    <Button type="button" variant="secondary" onClick={addProductLine}>
                      Adicionar
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lines.length === 0 ? (
                      <p className="text-sm text-stone-500">Nenhuma linha ainda.</p>
                    ) : (
                      lines.map((line) => (
                        <div key={line.key} className="surface-muted p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-ink-900">{line.label}</p>
                              <p className="text-xs text-stone-500">
                                Preço central ref.: {money(line.unitPriceHint)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setLines((prev) => prev.filter((l) => l.key !== line.key))
                              }
                            >
                              Remover
                            </Button>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block text-xs">
                              Quantidade
                              <input
                                type="number"
                                min="0.001"
                                step="any"
                                value={line.quantity}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key ? { ...l, quantity: e.target.value } : l,
                                    ),
                                  )
                                }
                                className="mt-1 h-9 w-full rounded-md border border-sand-200 bg-white px-2"
                              />
                            </label>
                            <label className="block text-xs">
                              Desconto (linha)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.discount}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key ? { ...l, discount: e.target.value } : l,
                                    ),
                                  )
                                }
                                className="mt-1 h-9 w-full rounded-md border border-sand-200 bg-white px-2"
                              />
                            </label>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="surface p-4">
                  <h4 className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    D — Resumo (estimativa local)
                  </h4>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    Totais oficiais só após submissão — esta estimativa usa preços centrais
                    verificados em cache do mapeamento e nunca substitui a resposta Aggregate.
                  </p>
                  <dl className="font-ui mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Subtotal</dt>
                      <dd>{money(liveTotals.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Descontos</dt>
                      <dd>{money(liveTotals.discount)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold text-ink-900">
                      <dt>Total estimado</dt>
                      <dd>{money(liveTotals.total)}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="space-y-3 border-t border-sand-200 bg-white px-5 py-4">
                <label className="font-ui flex items-center gap-2 text-sm text-ink-900">
                  <input
                    type="checkbox"
                    checked={submitNow}
                    onChange={(e) => setSubmitNow(e.target.checked)}
                  />
                  Enviar imediatamente para o sistema central após criar
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={pending || mappingOptions.length === 0}
                >
                  {pending
                    ? "A processar…"
                    : submitNow
                      ? "Criar e emitir no sistema central"
                      : "Criar rascunho local"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceActionHints() {
  return (
    <p className="font-ui flex items-center gap-2 text-xs text-stone-500">
      <Send className="h-3.5 w-3.5" /> Submeter · <RefreshCw className="h-3.5 w-3.5" /> Actualizar
      estado central
    </p>
  );
}
