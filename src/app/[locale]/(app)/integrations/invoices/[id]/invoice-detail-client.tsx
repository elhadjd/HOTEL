"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type InvoiceDetail = {
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
  notes: string | null;
  guestLabel: string | null;
  hotelLabel: string | null;
  stayId: string | null;
  reservationId: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    discount?: number;
    description?: string;
    centralName?: string | null;
    localCode?: string | null;
  }>;
  attempts: Array<{
    id: string;
    attemptNo: number;
    outcome: string;
    createdAt: string;
    errorMessage: string | null;
  }>;
};

function money(value: number | null | undefined, currency = "AOA") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function InvoiceDetailClient({
  invoice: initial,
  mappings,
}: {
  invoice: InvoiceDetail;
  mappings: Array<SearchableOption & { unitPriceHint?: number | null }>;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [productPick, setProductPick] = useState("");
  const [qty, setQty] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [mappingOptions, setMappingOptions] = useState(mappings);

  const editable =
    invoice.status === "CREATED" &&
    (invoice.centralState === "Cotação" || invoice.centralState === "Proforma");
  const submittable = ["DRAFT", "PENDING_SUBMISSION", "FAILED_VALIDATION"].includes(
    invoice.status,
  );

  const localSummary = useMemo(() => {
    let subtotal = 0;
    let disc = 0;
    for (const line of invoice.lines) {
      subtotal += Number(line.unit_price) * Number(line.quantity);
      disc += Number(line.discount ?? 0);
    }
    return {
      subtotal: Number(subtotal.toFixed(2)),
      disc: Number(disc.toFixed(2)),
      total: Number((subtotal - disc).toFixed(2)),
    };
  }, [invoice.lines]);

  const centralDiscrepancy =
    invoice.centralTotal != null &&
    Math.abs(Number(invoice.centralTotal) - localSummary.total) > 0.01;

  const searchMappings = useCallback(async (query: string) => {
    const params = new URLSearchParams({ take: "50", activeOnly: "1" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao pesquisar produtos");
    const next = (data.mappings as Array<{
      localCode: string;
      localLabel?: string | null;
      centralName?: string | null;
      centralProductId?: string;
      centralSalePrice?: unknown;
      active?: boolean;
    }>)
      .filter((m) => m.active !== false)
      .map((m) => ({
        value: m.localCode,
        label: m.localLabel || m.centralName || m.localCode,
        keywords: [m.localCode, m.centralProductId ?? "", m.centralName ?? ""],
        description:
          m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
        unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
      }));
    setMappingOptions((prev) => {
      const byValue = new Map(prev.map((m) => [m.value, m]));
      for (const m of next) byValue.set(m.value, m);
      return [...byValue.values()];
    });
    return next;
  }, []);

  function act(path: "submit" | "reconcile" | "refresh") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${invoice.id}/${path}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `${path} failed`);
        if (data.invoice) setInvoice((prev) => ({ ...prev, ...normalizeInvoice(data.invoice, prev) }));
        return;
      }
      setInvoice((prev) => ({ ...prev, ...normalizeInvoice(data.invoice, prev) }));
      setMessage(`Actualizado: ${data.invoice?.status} / ${data.invoice?.centralState ?? "—"}`);
      router.refresh();
    });
  }

  function addItems(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!productPick) {
      setError("Seleccione um produto.");
      return;
    }
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `ui-append-${crypto.randomUUID()}`
        : `ui-append-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${invoice.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          lines: [
            {
              mappingLocalCode: productPick,
              quantity: Number(qty) || 1,
              discount: Number(discount) || 0,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao adicionar produtos");
        if (data.invoice) setInvoice((prev) => ({ ...prev, ...normalizeInvoice(data.invoice, prev) }));
        return;
      }
      if (data.invoice) setInvoice((prev) => ({ ...prev, ...normalizeInvoice(data.invoice, prev) }));
      setMessage("Produtos adicionados no documento central. Totais = resposta Aggregate.");
      setProductPick("");
      setQty("1");
      setDiscount("0");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/integrations/invoices" className="font-ui text-sm text-teal-700 hover:underline">
            ← Voltar à lista
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-ink-900">{invoice.externalId}</h1>
          <p className="font-ui mt-1 text-sm text-stone-500">
            {invoice.saleKey ?? "Ainda sem sale_key central"}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <StatusPill value={invoice.requestedState} />
            <StatusPill value={invoice.status} />
            {invoice.centralState ? <StatusPill value={invoice.centralState} /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {submittable ? (
            <Button type="button" disabled={pending} onClick={() => act("submit")}>
              Submeter ao SIGESC
            </Button>
          ) : null}
          {invoice.status === "RECONCILIATION_REQUIRED" ? (
            <Button type="button" disabled={pending} onClick={() => act("reconcile")}>
              Reconciliar
            </Button>
          ) : null}
          {invoice.saleKey ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => act("refresh")}
            >
              Actualizar estado central
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-ink-900">Contexto operacional</h2>
          <dl className="font-ui mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-stone-500">Hóspede / cliente</dt>
              <dd className="font-medium text-ink-900">{invoice.guestLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Hotel</dt>
              <dd className="font-medium text-ink-900">{invoice.hotelLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Estadia</dt>
              <dd className="font-medium text-ink-900">{invoice.stayId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Reserva</dt>
              <dd className="font-medium text-ink-900">{invoice.reservationId ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-stone-500">Notas</dt>
              <dd>{invoice.notes || "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="surface p-5">
          <h2 className="text-lg font-semibold text-ink-900">Resumo financeiro</h2>
          <p className="font-ui mt-1 text-xs text-stone-500">
            Totais oficiais = resposta Aggregate. Estimativa local só para linhas em rascunho.
          </p>
          <dl className="font-ui mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal central</dt>
              <dd>{money(invoice.centralSubtotal, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IVA central</dt>
              <dd>{money(invoice.centralTax, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total central</dt>
              <dd>{money(invoice.centralTotal, invoice.currency)}</dd>
            </div>
            <div className="border-t border-sand-200 pt-2 text-xs text-stone-500">
              Estimativa linhas locais: {money(localSummary.total, invoice.currency)}
            </div>
            {centralDiscrepancy ? (
              <p className="mt-2 text-xs text-amber-800">
                Diferença face ao total central — prevalece o valor Aggregate (
                {money(invoice.centralTotal, invoice.currency)}).
              </p>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b border-sand-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink-900">Linhas</h2>
          <p className="font-ui mt-1 text-xs text-stone-500">
            Append-only: a Aggregate API não expõe remoção nem alteração de quantidade de linhas
            existentes. Não simulamos edições locais.
          </p>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qty</th>
              <th>Preço central</th>
              <th>Desconto</th>
              <th>Linha</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, idx) => {
              const net =
                Number(line.unit_price) * Number(line.quantity) - Number(line.discount ?? 0);
              return (
                <tr key={`${line.product_id}-${idx}`}>
                  <td>
                    <div className="font-medium">
                      {line.centralName ?? line.localCode ?? `#${line.product_id}`}
                    </div>
                    <div className="text-xs text-stone-500">#{line.product_id}</div>
                  </td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unit_price, invoice.currency)}</td>
                  <td>{money(line.discount ?? 0, invoice.currency)}</td>
                  <td>{money(net, invoice.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable ? (
        <form onSubmit={addItems} className="surface p-5">
          <h2 className="text-lg font-semibold text-ink-900">Adicionar produtos</h2>
          <p className="font-ui mt-1 text-sm text-stone-500">
            Actualiza o mesmo documento central ({invoice.centralState}). Publicado/Pago bloqueiam
            mutações no servidor após verificação do estado actual. Cada pedido leva uma chave de
            idempotência local; retries com a mesma chave não voltam a chamar Aggregate se
            ADD_ITEMS_OK já existir.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_0.5fr_0.5fr_auto]">
            <SearchableSelect
              options={mappingOptions}
              value={productPick}
              onChange={setProductPick}
              onSearch={searchMappings}
              labels={{
                placeholder: "Produto / SKU",
                searchPlaceholder: "Nome, código…",
                refineSearch: "Catálogo grande — refine a pesquisa no servidor.",
              }}
            />
            <input
              type="number"
              min="0.001"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
              placeholder="Qty"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
              placeholder="Desconto"
            />
            <Button type="submit" disabled={pending}>
              Adicionar
            </Button>
          </div>
        </form>
      ) : (
        <div className="surface-muted p-4">
          <p className="font-ui text-sm text-stone-600">
            {invoice.status !== "CREATED"
              ? "Submeta o rascunho ao SIGESC antes de acrescentar produtos ao documento central."
              : `Documento central em estado "${invoice.centralState ?? "desconhecido"}" — edição financeira bloqueada.`}
          </p>
        </div>
      )}

      <div className="surface p-5">
        <h2 className="text-lg font-semibold text-ink-900">Histórico de integração</h2>
        <ul className="font-ui mt-3 space-y-2 text-sm">
          {invoice.attempts.length === 0 ? (
            <li className="text-stone-500">Sem tentativas ainda.</li>
          ) : (
            invoice.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-sand-100 py-2">
                <span>
                  #{a.attemptNo} · {a.outcome}
                  {a.errorMessage ? (
                    <span className="text-danger"> — {a.errorMessage}</span>
                  ) : null}
                </span>
                <span className="text-xs text-stone-500">
                  {new Date(a.createdAt).toLocaleString("pt-PT")}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function normalizeInvoice(
  incoming: Record<string, unknown>,
  prev: InvoiceDetail,
): Partial<InvoiceDetail> {
  return {
    ...prev,
    id: String(incoming.id ?? prev.id),
    status: String(incoming.status ?? prev.status),
    saleKey: (incoming.saleKey as string | null) ?? prev.saleKey,
    centralState: (incoming.centralState as string | null) ?? prev.centralState,
    centralTotal:
      incoming.centralTotal != null ? Number(incoming.centralTotal) : prev.centralTotal,
    centralSubtotal:
      incoming.centralSubtotal != null ? Number(incoming.centralSubtotal) : prev.centralSubtotal,
    centralTax: incoming.centralTax != null ? Number(incoming.centralTax) : prev.centralTax,
    lastError: (incoming.lastError as string | null) ?? prev.lastError,
  };
}
