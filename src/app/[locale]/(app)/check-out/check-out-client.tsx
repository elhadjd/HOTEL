"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

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
}: {
  initialDepartures: Departure[];
  focusStayId?: string;
}) {
  const router = useRouter();
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
    hasLinkedCustomer?: boolean;
  } | null>(null);
  const [invoiceHint, setInvoiceHint] = useState<string | null>(null);
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

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/stays/departures");
      const data = await res.json();
      if (res.ok) setRows(JSON.parse(JSON.stringify(data.departures ?? [])));
    });
  }

  function loadPrep() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${selected.id}/check-out`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao preparar check-out");
        return;
      }
      setPrep(data.readiness ?? data.prep?.readiness ?? null);
      const inv = data.invoice ?? data.eligibleInvoice;
      setInvoiceHint(
        inv
          ? `${inv.externalId ?? inv.id} · ${inv.centralState ?? inv.status}`
          : "Sem documento Aggregate ligado nesta vista",
      );
      setStep(2);
    });
  }

  function confirmCheckout() {
    if (!selected) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${selected.id}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestProforma: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-out failed");
        return;
      }
      setMessage(
        `Check-out operacional concluído (handoff ${data.handoff ?? "OK"}). Quarto segue o turnover Phase 6 — não fica disponível até limpeza/inspecção.`,
      );
      setStep(3);
      refresh();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
          Recepção
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-ink-900">Check-out guiado</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-600">
          Reutiliza o serviço Phase 6. Check-out não paga nem publica documentos centrais.
        </p>
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
                        {d.reservation.code} · {d.room.code}
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
              <dd className="text-right">{invoiceHint ?? "—"}</dd>
            </div>
          </dl>
          <p className="font-ui mt-4 text-xs text-stone-500">
            Confirmação explícita necessária. O turnover do quarto (DIRTY + tarefa) é feito pelo
            serviço Phase 6 — não inventamos pagamento.
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
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Check-out concluído</h2>
          <p className="font-ui mt-2 text-sm text-stone-600">
            Estadia fechada operacionalmente. Quarto indisponível para novos hóspedes até
            limpeza e inspecção.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/front-desk">
              <Button type="button">Front Desk</Button>
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
