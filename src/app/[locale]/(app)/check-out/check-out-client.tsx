"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import {
  InvoiceSettlementActions,
  type SettleableInvoiceSummary,
} from "@/components/invoices/invoice-settlement-actions";

type Departure = {
  id: string;
  status: string;
  expectedDeparture: string;
  actualArrival: string;
  guest: {
    firstName: string;
    lastName: string;
    customerMapping: { syncStatus: string } | null;
  };
  room: { code: string };
  reservation: { code: string };
  accountLines: Array<{
    id: string;
    description: string;
    unitPrice: string | number;
    quantity: string | number;
  }>;
};

export function CheckOutClient({
  initialDepartures,
  focusStayId,
  canSettleInvoices = false,
}: {
  initialDepartures: Departure[];
  focusStayId?: string;
  canSettleInvoices?: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"overdue" | "today" | "all">("overdue");
  const [rows, setRows] = useState(initialDepartures);
  const [selectedId, setSelectedId] = useState(
    focusStayId && initialDepartures.some((d) => d.id === focusStayId)
      ? focusStayId
      : initialDepartures[0]?.id ?? null,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prep, setPrep] = useState<{
    openHousekeepingNonTurnover?: number;
    blockingMaintenance?: number;
    chargeCount?: number;
    unbilledMappedChargeCount?: number;
    hasLinkedCustomer?: boolean;
  } | null>(null);
  const [eligibleInvoice, setEligibleInvoice] = useState<SettleableInvoiceSummary | null>(null);
  const [suggestedLines, setSuggestedLines] = useState<
    Array<{ mappingLocalCode: string; label: string; quantity: number }>
  >([]);
  const [requestProforma, setRequestProforma] = useState(true);
  const [resultInvoiceId, setResultInvoiceId] = useState<string | null>(null);
  const [resultInvoice, setResultInvoice] = useState<SettleableInvoiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => rows.find((d) => d.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const chargeTotal = useMemo(() => {
    if (!selected) return 0;
    return selected.accountLines.reduce(
      (s, l) => s + Number(l.unitPrice) * Number(l.quantity),
      0,
    );
  }, [selected]);

  function loadScope(nextScope: "overdue" | "today" | "all") {
    setScope(nextScope);
    setError(null);
    startTransition(async () => {
      const params = new URLSearchParams({ scope: nextScope });
      if (focusStayId) params.set("focusStayId", focusStayId);
      const res = await fetch(`/api/v1/stays/departures?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const nextRows: Departure[] = JSON.parse(JSON.stringify(data.departures ?? []));
        setRows(nextRows);
        if (!nextRows.some((r) => r.id === selectedId)) {
          setSelectedId(nextRows[0]?.id ?? null);
        }
      }
    });
  }

  function refresh() {
    loadScope(scope);
  }

  function loadPrep() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${selected.id}/check-out`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao preparar check-out");
        return;
      }
      setPrep(data.readiness ?? data.prep?.readiness ?? null);
      const inv = data.eligibleInvoice ?? data.invoice ?? null;
      const lines = Array.isArray(data.suggestedLines) ? data.suggestedLines : [];
      setEligibleInvoice(inv);
      setSuggestedLines(lines);
      setRequestProforma(Boolean(lines.length > 0 || inv));
      setStep(2);
    });
  }

  function confirmCheckout() {
    if (!selected) return;
    setError(null);
    setMessage(null);
    setResultInvoiceId(null);
    setResultInvoice(null);
    startTransition(async () => {
      const shouldRequestProforma =
        requestProforma && (suggestedLines.length > 0 || Boolean(eligibleInvoice));
      const res = await fetch(`/api/v1/stays/${selected.id}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestProforma: shouldRequestProforma,
          ...(shouldRequestProforma && suggestedLines.length > 0
            ? {
                mappingLocalCodes: suggestedLines.map((l) => ({
                  mappingLocalCode: l.mappingLocalCode,
                  quantity: l.quantity,
                })),
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Check-out failed");
        return;
      }
      setResultInvoiceId(data.invoiceId ?? eligibleInvoice?.id ?? null);
      setResultInvoice(data.invoice ?? eligibleInvoice ?? null);
      if (data.handoff === "RECONCILIATION_PENDING" || data.handoff === "PENDING") {
        setError(
          data.message ??
            "Handoff financeiro no SIGESC ficou pendente de reconciliação — check-out não foi concluído.",
        );
        return;
      }
      setMessage(
        data.handoff === "CENTRAL_CONFIRMED"
          ? "Check-out concluído com Proforma/documento confirmado no SIGESC. Pode publicar e liquidar a fatura abaixo sem sair da recepção."
          : `Check-out operacional concluído (handoff ${data.handoff ?? "NOT_REQUIRED"}). Quarto segue para limpeza/inspecção.`,
      );
      setStep(3);
      refresh();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
            Recepção
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-ink-900">Check-out guiado</h1>
          <p className="font-ui mt-1 max-w-2xl text-sm text-stone-600">
            Alterne entre partidas do dia/em atraso ou todas as estadias activas (para saídas
            antecipadas). Pode emitir, publicar e liquidar a fatura no SIGESC directamente aqui.
          </p>
        </div>
        <div className="font-ui flex flex-wrap gap-2 text-xs">
          {(
            [
              ["overdue", "Hoje + em atraso"],
              ["today", "Só hoje"],
              ["all", "Todas activas (saída antecipada)"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={() => {
                setStep(1);
                loadScope(key);
              }}
              className={`rounded-md px-3 py-1.5 ${
                scope === key
                  ? "bg-ink-900 text-white"
                  : "border border-sand-200 bg-white text-stone-600 hover:bg-sand-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="surface overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState title="Sem partidas" description="Nenhuma estadia a sair." />
            ) : (
              <ul className="divide-y divide-sand-100">
                {rows.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`w-full px-4 py-3 text-left hover:bg-sand-50 ${
                        selectedId === d.id ? "bg-teal-50" : ""
                      }`}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <p className="font-medium">
                        {d.guest.firstName} {d.guest.lastName}
                      </p>
                      <p className="font-ui text-xs text-stone-500">
                        {d.reservation.code} · {d.room.code} · sai {d.expectedDeparture.slice(0, 10)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected ? (
            <div className="surface p-5">
              <h2 className="text-lg font-semibold">Antes do check-out</h2>
              <dl className="font-ui mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-500">Quarto</dt>
                  <dd>{selected.room.code}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Chegada</dt>
                  <dd>{new Date(selected.actualArrival).toLocaleString("pt-PT")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Partida prevista</dt>
                  <dd>{selected.expectedDeparture.slice(0, 10)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Cargos operacionais</dt>
                  <dd>{chargeTotal.toFixed(2)} AOA</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">
                <StatusPill value={selected.status} />
                <StatusPill
                  value={selected.guest.customerMapping?.syncStatus ?? "SEM_CLIENTE"}
                />
              </div>
              <ul className="font-ui mt-4 space-y-1 text-xs text-stone-500">
                {selected.accountLines.map((l) => (
                  <li key={l.id}>
                    {l.description} · {Number(l.quantity)} × {Number(l.unitPrice)}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/stays/${selected.id}`}>
                  <Button type="button" variant="secondary">
                    Abrir estadia / documento
                  </Button>
                </Link>
                <Button type="button" disabled={pending} onClick={loadPrep}>
                  Continuar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 && selected ? (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Confirmação</h2>
          <dl className="font-ui mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Cliente ligado</dt>
              <dd>{prep?.hasLinkedCustomer ? "Sim" : "Não / desconhecido"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>HK abertas (não turnover)</dt>
              <dd>{prep?.openHousekeepingNonTurnover ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Manutenção bloqueante</dt>
              <dd>{prep?.blockingMaintenance ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Documento Aggregate</dt>
              <dd className="text-right">
                {eligibleInvoice ? (
                  <Link
                    href={`/integrations/invoices/${eligibleInvoice.id}`}
                    className="text-teal-700 underline"
                  >
                    {eligibleInvoice.orderReference ?? eligibleInvoice.externalId} ·{" "}
                    {eligibleInvoice.centralState ?? eligibleInvoice.status}
                  </Link>
                ) : (
                  "Nenhum documento criado ainda"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Itens mapeados por enviar ao SIGESC</dt>
              <dd>{suggestedLines.length}</dd>
            </div>
          </dl>

          {suggestedLines.length > 0 || eligibleInvoice ? (
            <label className="font-ui mt-4 flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={requestProforma}
                onChange={(e) => setRequestProforma(e.target.checked)}
              />
              {eligibleInvoice
                ? "Confirmar / anexar itens pendentes ao documento SIGESC existente"
                : "Criar e submeter Proforma no SIGESC com os itens mapeados da estadia"}
            </label>
          ) : (
            <p className="font-ui mt-4 text-xs text-amber-800">
              Sem itens mapeados por enviar. O check-out será apenas operacional (para faturar no
              SIGESC, crie uma Cotação/Proforma na estadia ou em Faturas).
            </p>
          )}

          {eligibleInvoice && suggestedLines.length === 0 ? (
            <div className="mt-4">
              <InvoiceSettlementActions
                compact
                canSettle={canSettleInvoices}
                invoice={eligibleInvoice}
                onUpdated={({ invoice: inc }) => {
                  setEligibleInvoice((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: String(inc.status ?? prev.status),
                          orderReference:
                            "orderReference" in inc
                              ? (inc.orderReference as string | null)
                              : prev.orderReference,
                          centralState:
                            "centralState" in inc
                              ? (inc.centralState as string | null)
                              : prev.centralState,
                          centralTotal:
                            inc.centralTotal != null
                              ? Number(inc.centralTotal)
                              : prev.centralTotal,
                          centralRestPayable:
                            inc.centralRestPayable != null
                              ? Number(inc.centralRestPayable)
                              : prev.centralRestPayable,
                        }
                      : prev,
                  );
                }}
              />
            </div>
          ) : null}

          <p className="font-ui mt-3 text-xs text-stone-500">
            Confirmação explícita necessária. O turnover do quarto (DIRTY + tarefa) é feito
            atomicamente; após confirmar, pode publicar e liquidar a fatura no SIGESC no passo
            seguinte.
          </p>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button type="button" disabled={pending} onClick={confirmCheckout}>
              {pending ? "A processar…" : "Confirmar check-out"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="surface space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Check-out concluído</h2>
            <p className="font-ui mt-2 text-sm text-stone-600">
              Estadia fechada operacionalmente. Quarto indisponível para novos hóspedes até
              limpeza e inspecção.
            </p>
          </div>

          {resultInvoice ? (
            <InvoiceSettlementActions
              canSettle={canSettleInvoices}
              invoice={resultInvoice}
              onUpdated={({ invoice: inc }) => {
                setResultInvoice((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: String(inc.status ?? prev.status),
                        orderReference:
                          "orderReference" in inc
                            ? (inc.orderReference as string | null)
                            : prev.orderReference,
                        centralState:
                          "centralState" in inc
                            ? (inc.centralState as string | null)
                            : prev.centralState,
                        centralTotal:
                          inc.centralTotal != null ? Number(inc.centralTotal) : prev.centralTotal,
                        centralRestPayable:
                          inc.centralRestPayable != null
                            ? Number(inc.centralRestPayable)
                            : prev.centralRestPayable,
                      }
                    : prev,
                );
              }}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {resultInvoiceId ? (
              <Link href={`/integrations/invoices/${resultInvoiceId}`}>
                <Button type="button">Abrir detalhe completo da fatura</Button>
              </Link>
            ) : null}
            <Link href="/dashboard/front-desk">
              <Button type="button" variant="secondary">
                Front Desk
              </Button>
            </Link>
            <Link href="/housekeeping/operations">
              <Button type="button" variant="secondary">
                Governança
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
