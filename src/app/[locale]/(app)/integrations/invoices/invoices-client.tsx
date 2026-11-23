"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";

export type InvoiceRow = {
  id: string;
  externalId: string;
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

function money(value: number | null | undefined, currency = "AOA") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function InvoicesClient({
  invoices: initial,
  total: initialTotal,
  guests,
  reservations,
  stays,
  hotels,
  mappings,
  prefill,
}: {
  invoices: InvoiceRow[];
  total: number;
  guests: SearchableOption[];
  reservations: SearchableOption[];
  stays: SearchableOption[];
  hotels: SearchableOption[];
  mappings: Array<SearchableOption & { unitPriceHint?: number | null }>;
  prefill?: { stayId?: string; guestId?: string; hotelId?: string };
}) {
  const router = useRouter();
  const [rows] = useState(initial);
  const [total] = useState(initialTotal);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(Boolean(prefill?.stayId));

  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [guestFilter, setGuestFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [guestId, setGuestId] = useState(prefill?.guestId ?? "");
  const [reservationId, setReservationId] = useState("");
  const [stayId, setStayId] = useState(prefill?.stayId ?? "");
  const [hotelId, setHotelId] = useState(prefill?.hotelId ?? "");
  const [state, setState] = useState("Cotação");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productPick, setProductPick] = useState("");

  const filteredRows = useMemo(() => {
    return rows.filter((inv) => {
      if (stateFilter && inv.requestedState !== stateFilter) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (guestFilter && inv.guestId !== guestFilter) return false;
      if (from && new Date(inv.createdAt) < new Date(from)) return false;
      if (to && new Date(inv.createdAt) > new Date(`${to}T23:59:59`)) return false;
      if (q.trim()) {
        const hay = [
          inv.externalId,
          inv.saleKey,
          inv.centralState,
          inv.guestLabel,
          inv.hotelLabel,
          inv.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, q, stateFilter, statusFilter, guestFilter, from, to]);

  const summaryCards = useMemo(() => {
    const created = filteredRows.filter((r) => r.status === "CREATED").length;
    const drafts = filteredRows.filter((r) => r.status === "DRAFT").length;
    const editable = filteredRows.filter(
      (r) => r.centralState === "Cotação" || r.centralState === "Proforma",
    ).length;
    const centralTotal = filteredRows.reduce((acc, r) => acc + (r.centralTotal ?? 0), 0);
    return { created, drafts, editable, centralTotal };
  }, [filteredRows]);

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

  function addProductLine() {
    const mapping = mappings.find((m) => m.value === productPick);
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
      setMessage(`Rascunho ${data.invoice.externalId} criado. Submeta para o SIGESC.`);
      setCreateOpen(false);
      setLines([]);
      router.refresh();
      router.push(`/integrations/invoices/${data.invoice.id}`);
    });
  }

  function clearFilters() {
    setQ("");
    setStateFilter("");
    setStatusFilter("");
    setGuestFilter("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-6">
      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm text-ink-900">
          A Aggregate API só cria <strong>Cotação</strong> ou <strong>Proforma</strong>. Publicar,
          cobrar e stock continuam no SIGESC. O preço de linha é sempre o{" "}
          <strong>sale_price</strong> central verificado; descontos de linha são suportados pelo
          contrato.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">Documentos</p>
          <p className="mt-2 text-2xl font-semibold text-ink-900">{filteredRows.length}</p>
          <p className="font-ui text-xs text-stone-500">de {total} no total</p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">No SIGESC</p>
          <p className="mt-2 text-2xl font-semibold text-ink-900">{summaryCards.created}</p>
          <p className="font-ui text-xs text-stone-500">{summaryCards.editable} editáveis</p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">Rascunhos</p>
          <p className="mt-2 text-2xl font-semibold text-ink-900">{summaryCards.drafts}</p>
        </div>
        <div className="surface p-4">
          <p className="font-ui text-[11px] uppercase tracking-[0.16em] text-stone-400">
            Totais centrais
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink-900">
            {money(summaryCards.centralTotal)}
          </p>
          <p className="font-ui text-xs text-stone-500">Só valores devolvidos pelo SIGESC</p>
        </div>
      </div>

      <div className="surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">Documentos financeiros</h3>
            <p className="font-ui text-xs text-stone-500">
              Pesquisa, filtros e acesso ao detalhe com adição contínua de produtos.
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova cotação / proforma
          </Button>
        </div>

        <div className="font-ui mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block xl:col-span-2">
            <span className="text-xs text-stone-500">Pesquisar</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nº, cliente, hóspede, sale_key…"
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
            <span className="text-xs text-stone-500">Estado local</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="DRAFT">DRAFT</option>
              <option value="CREATED">CREATED</option>
              <option value="RECONCILIATION_REQUIRED">RECONCILIATION</option>
              <option value="FAILED_VALIDATION">FAILED_VALIDATION</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Hóspede</span>
            <SearchableSelect
              options={guests}
              value={guestFilter}
              onChange={setGuestFilter}
              labels={{ placeholder: "Todos", searchPlaceholder: "Nome, email…" }}
              className="mt-1"
            />
          </label>
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
        {filteredRows.length === 0 ? (
          <EmptyState
            title="Sem documentos"
            description="Crie uma cotação/proforma ou ajuste os filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Tipo / estado</th>
                  <th>Contexto</th>
                  <th>Itens</th>
                  <th>Totais SIGESC</th>
                  <th>Actualizado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-medium text-ink-900">{inv.externalId}</div>
                      <div className="text-xs text-stone-500">{inv.saleKey ?? "sem sale_key"}</div>
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
                      <div className="text-xs text-stone-500">{inv.hotelLabel ?? "—"}</div>
                    </td>
                    <td>
                      {inv.summary.itemCount} · qty {inv.summary.totalQuantity}
                      {inv.summary.discount > 0 ? (
                        <div className="text-xs text-stone-500">
                          desc. {money(inv.summary.discount, inv.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td>
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
                    <td className="text-xs text-stone-500">
                      {new Date(inv.updatedAt).toLocaleString("pt-PT")}
                    </td>
                    <td>
                      <Link
                        href={`/integrations/invoices/${inv.id}`}
                        className="text-teal-700 hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <label className="block text-sm">
                    <span className="text-stone-500">Hóspede (cliente SIGESC ligado)</span>
                    <SearchableSelect
                      className="mt-1"
                      options={guests}
                      value={guestId}
                      onChange={setGuestId}
                      labels={{
                        placeholder: "Seleccionar hóspede",
                        searchPlaceholder: "Nome, email, telefone…",
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-stone-500">Hotel</span>
                    <SearchableSelect
                      className="mt-1"
                      options={hotels}
                      value={hotelId}
                      onChange={setHotelId}
                      labels={{ placeholder: "Opcional", searchPlaceholder: "Hotel…" }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-stone-500">Estadia activa</span>
                    <SearchableSelect
                      className="mt-1"
                      options={stays}
                      value={stayId}
                      onChange={setStayId}
                      labels={{ placeholder: "Opcional", searchPlaceholder: "Estadia…" }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-stone-500">Reserva</span>
                    <SearchableSelect
                      className="mt-1"
                      options={reservations}
                      value={reservationId}
                      onChange={setReservationId}
                      labels={{ placeholder: "Opcional", searchPlaceholder: "Código…" }}
                    />
                  </label>
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
                      options={mappings}
                      value={productPick}
                      onChange={setProductPick}
                      labels={{
                        placeholder: "Pesquisar produto / SKU",
                        searchPlaceholder: "Nome, código, SKU…",
                        empty: "Configure mapeamentos de catálogo",
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
                    verificados em cache do mapeamento.
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

              <div className="border-t border-sand-200 bg-white px-5 py-4">
                <Button type="submit" className="w-full" disabled={pending || mappings.length === 0}>
                  {pending ? "A gravar…" : "Criar rascunho e abrir"}
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
