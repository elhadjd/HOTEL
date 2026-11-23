"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type StayRow = {
  id: string;
  status: string;
  actualArrival: string;
  expectedDeparture: string;
  guest: { firstName: string; lastName: string };
  room: { code: string };
  reservation: { code: string };
  companions: Array<{ guest: { firstName: string; lastName: string } }>;
};

export function StaysClient({
  locale,
  initialStays,
}: {
  locale: string;
  initialStays: StayRow[];
}) {
  const [stays, setStays] = useState(initialStays);
  const [selected, setSelected] = useState<string | null>(null);
  const [toRoomId, setToRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/stays");
      const data = await res.json();
      if (res.ok) setStays(JSON.parse(JSON.stringify(data.stays ?? [])));
    });
  }

  function transfer() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${selected}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toRoomId, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Transfer failed");
        return;
      }
      setMessage("Transferência concluída");
      setToRoomId("");
      setReason("");
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink-900">Estadias activas</h1>
        <p className="mt-1 text-sm text-stone-600">
          Ocupação actual, acompanhantes e transferência de quarto.
        </p>
      </div>
      {error ? <p className="text-sm text-terracotta-700">{error}</p> : null}
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-3">Reserva</th>
              <th className="py-2 pr-3">Hóspede</th>
              <th className="py-2 pr-3">Quarto</th>
              <th className="py-2 pr-3">Saída prevista</th>
              <th className="py-2 pr-3">Acomp.</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {stays.map((s) => (
              <tr
                key={s.id}
                className={`cursor-pointer border-b border-stone-100 ${selected === s.id ? "bg-teal-50/60" : ""}`}
                onClick={() => setSelected(s.id)}
              >
                <td className="py-3 pr-3">{s.reservation.code}</td>
                <td className="py-3 pr-3">
                  {s.guest.firstName} {s.guest.lastName}
                </td>
                <td className="py-3 pr-3">{s.room.code}</td>
                <td className="py-3 pr-3">{String(s.expectedDeparture).slice(0, 10)}</td>
                <td className="py-3 pr-3">{s.companions.length}</td>
                <td className="py-3">{s.status}</td>
              </tr>
            ))}
            {stays.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-stone-500">
                  Sem estadias activas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="surface space-y-3 p-5">
            <h2 className="font-display text-xl text-ink-900">Documento financeiro da estadia</h2>
            <p className="font-ui text-sm text-stone-500">
              Abra a cotação/proforma associada ou crie uma nova a partir desta estadia activa.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex h-10 items-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-500"
                href={`/${locale}/integrations/invoices?stayId=${selected}`}
              >
                Ver / criar cotação da estadia
              </a>
              <a
                className="inline-flex h-10 items-center rounded-md border border-sand-200 bg-white px-4 text-sm text-ink-900 hover:bg-sand-100"
                href={`/${locale}/check-out`}
              >
                Ir para saídas
              </a>
            </div>
          </div>
          <div className="surface space-y-3 p-5">
            <h2 className="font-display text-xl text-ink-900">Transferir quarto</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                ID do quarto destino
                <input
                  className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2"
                  value={toRoomId}
                  onChange={(e) => setToRoomId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Motivo
                <input
                  className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={pending || !toRoomId || !reason} onClick={transfer}>
                Confirmar transferência
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
