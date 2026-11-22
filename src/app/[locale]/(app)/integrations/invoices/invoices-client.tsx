"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Invoice = {
  id: string;
  externalId: string;
  requestedState: string;
  status: string;
  saleKey: string | null;
  centralState: string | null;
  centralTotal: string | number | null;
  centralSubtotal: string | number | null;
  centralTax: string | number | null;
  lastError: string | null;
  reservationId: string | null;
  guestId: string | null;
};

export function InvoicesClient({
  invoices: initial,
  guests,
  reservations,
  mappings,
}: {
  invoices: Invoice[];
  guests: Array<{ id: string; label: string }>;
  reservations: Array<{ id: string; label: string }>;
  mappings: Array<{ localCode: string; localLabel: string }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [guestId, setGuestId] = useState(guests[0]?.id ?? "");
  const [reservationId, setReservationId] = useState(reservations[0]?.id ?? "");
  const [state, setState] = useState("Cotação");
  const [mappingCode, setMappingCode] = useState(mappings[0]?.localCode ?? "");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackName, setFallbackName] = useState("");

  function createDraft(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guestId || undefined,
          reservationId: reservationId || undefined,
          state,
          notes: notes || undefined,
          lines: [{ mappingLocalCode: mappingCode, quantity: Number(qty) || 1 }],
          useCustomerFallback: useFallback || undefined,
          customerFallback: useFallback ? { name: fallbackName } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Draft failed");
        return;
      }
      setRows((prev) => [data.invoice, ...prev]);
      setMessage(`Rascunho criado (${data.invoice.externalId}). Ainda não enviado ao SIGESC.`);
      router.refresh();
    });
  }

  function act(id: string, path: "submit" | "reconcile" | "refresh") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${id}/${path}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `${path} failed`);
        // Still refresh row if partial update returned
        if (data.invoice) {
          setRows((prev) => prev.map((r) => (r.id === id ? data.invoice : r)));
        }
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? data.invoice : r)));
      if (data.invoice?.status === "CREATED") {
        setMessage(
          `Documento ${data.invoice.saleKey} criado como ${data.invoice.centralState}. Publicação e pagamento apenas no SIGESC.`,
        );
      } else if (data.invoice?.status === "RECONCILIATION_REQUIRED") {
        setMessage("Resultado ambíguo — reconciliação controlada necessária (mesmo external_id).");
      } else {
        setMessage(`Estado: ${data.invoice?.status}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm text-ink-900">
          A Aggregate API só cria <strong>Cotação</strong> ou <strong>Proforma</strong>. Publicar,
          numerar fiscalmente, cobrar e movimentar stock continua no SIGESC central.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-red-700">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <form onSubmit={createDraft} className="surface p-5">
        <h3 className="text-lg font-semibold text-ink-900">Nova cotação / proforma</h3>
        <p className="font-ui mt-1 text-xs text-stone-500">
          Acção explícita — não é criada automaticamente por reservas ou hóspedes.
        </p>
        <div className="font-ui mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <label className="block">
            <span className="text-stone-500">Hóspede</span>
            <select
              value={guestId}
              onChange={(e) => setGuestId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            >
              <option value="">—</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-stone-500">Reserva (opcional)</span>
            <select
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            >
              <option value="">—</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-stone-500">Estado</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            >
              <option value="Cotação">Cotação</option>
              <option value="Proforma">Proforma</option>
            </select>
          </label>
          <label className="block">
            <span className="text-stone-500">Linha (mapeamento)</span>
            <select
              required
              value={mappingCode}
              onChange={(e) => setMappingCode(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            >
              {mappings.map((m) => (
                <option key={m.localCode} value={m.localCode}>
                  {m.localLabel} ({m.localCode})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-stone-500">Quantidade</span>
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-stone-500">Notas</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3"
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={useFallback}
              onChange={(e) => setUseFallback(e.target.checked)}
            />
            <span>Autorizar fallback de dados de cliente (sem mapeamento)</span>
          </label>
          {useFallback ? (
            <input
              required
              value={fallbackName}
              onChange={(e) => setFallbackName(e.target.value)}
              placeholder="Nome do cliente (fallback)"
              className="h-10 w-full rounded-md border border-sand-200 px-3 sm:col-span-2"
            />
          ) : null}
        </div>
        <Button type="submit" disabled={pending || mappings.length === 0} className="mt-4">
          Criar rascunho local
        </Button>
        {mappings.length === 0 ? (
          <p className="font-ui mt-2 text-xs text-amber-800">
            Configure um mapeamento de catálogo antes de faturar.
          </p>
        ) : null}
      </form>

      <div className="surface overflow-hidden">
        <table className="font-ui w-full text-left text-sm">
          <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">External ID</th>
              <th className="px-4 py-3">Estado local</th>
              <th className="px-4 py-3">Central</th>
              <th className="px-4 py-3">Totais SIGESC</th>
              <th className="px-4 py-3">Acções</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-stone-500">
                  Sem documentos de integração.
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-b border-sand-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{inv.externalId}</div>
                    <div className="text-xs text-stone-500">{inv.requestedState}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{inv.status}</div>
                    {inv.lastError ? (
                      <div className="mt-1 text-xs text-red-700">{inv.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{inv.saleKey ?? "—"}</div>
                    <div className="text-xs text-stone-500">{inv.centralState ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {inv.centralTotal != null ? (
                      <>
                        <div>Total: {String(inv.centralTotal)}</div>
                        <div className="text-xs text-stone-500">
                          Sub {String(inv.centralSubtotal ?? "—")} · IVA{" "}
                          {String(inv.centralTax ?? "—")}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {["DRAFT", "PENDING_SUBMISSION", "FAILED_VALIDATION"].includes(inv.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => act(inv.id, "submit")}
                        >
                          Submeter
                        </Button>
                      ) : null}
                      {inv.status === "RECONCILIATION_REQUIRED" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => act(inv.id, "reconcile")}
                        >
                          Reconciliar
                        </Button>
                      ) : null}
                      {inv.saleKey ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => act(inv.id, "refresh")}
                        >
                          Actualizar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
