"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Departure = {
  id: string;
  status: string;
  expectedDeparture: string;
  actualArrival: string;
  guest: { firstName: string; lastName: string; customerMapping: { syncStatus: string } | null };
  room: { code: string };
  reservation: { code: string };
  accountLines: Array<{ id: string; description: string; unitPrice: string | number; quantity: string | number }>;
};

export function CheckOutClient({ initialDepartures }: { initialDepartures: Departure[] }) {
  const [rows, setRows] = useState(initialDepartures);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/stays/departures");
      const data = await res.json();
      if (res.ok) setRows(JSON.parse(JSON.stringify(data.departures ?? [])));
    });
  }

  function checkout(stayId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestProforma: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-out failed");
        return;
      }
      setMessage(`Check-out operacional concluído (${data.handoff ?? "OK"})`);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink-900">Saídas</h1>
        <p className="mt-1 text-sm text-stone-600">
          Revisão operacional e conclusão. Documentos fiscais oficiais apenas via Aggregate Cotação/Proforma.
        </p>
      </div>
      {error ? <p className="text-sm text-terracotta-700">{error}</p> : null}
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-3">Reserva</th>
              <th className="py-2 pr-3">Hóspede</th>
              <th className="py-2 pr-3">Quarto</th>
              <th className="py-2 pr-3">Conta ops.</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2">Acção</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-stone-100">
                <td className="py-3 pr-3">{d.reservation.code}</td>
                <td className="py-3 pr-3">
                  {d.guest.firstName} {d.guest.lastName}
                  <div className="text-xs text-stone-500">
                    Central: {d.guest.customerMapping?.syncStatus ?? "—"}
                  </div>
                </td>
                <td className="py-3 pr-3">{d.room.code}</td>
                <td className="py-3 pr-3">{d.accountLines.length} linhas</td>
                <td className="py-3 pr-3">{d.status}</td>
                <td className="py-3">
                  <Button type="button" size="sm" disabled={pending} onClick={() => checkout(d.id)}>
                    Concluir saída
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-stone-500">
                  Sem saídas previstas para hoje.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
