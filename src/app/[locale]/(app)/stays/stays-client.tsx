"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

type StayRow = {
  id: string;
  status: string;
  hotelId?: string;
  roomId?: string;
  actualArrival: string;
  expectedDeparture: string;
  guest: { firstName: string; lastName: string };
  room: { code: string };
  reservation: { code: string };
  companions: Array<{ guest: { firstName: string; lastName: string } }>;
};

type RoomOption = {
  id: string;
  code: string;
  hotelName: string;
  occupancyStatus: string;
};

export function StaysClient({
  locale,
  initialStays,
  rooms,
}: {
  locale: string;
  initialStays: StayRow[];
  rooms: RoomOption[];
}) {
  const [stays, setStays] = useState(initialStays);
  const [selected, setSelected] = useState<string | null>(null);
  const [toRoomId, setToRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedStay = useMemo(
    () => stays.find((s) => s.id === selected) ?? null,
    [stays, selected],
  );

  const roomOptions = useMemo(() => {
    return rooms
      .filter((r) => r.id !== selectedStay?.roomId)
      .map((r) => ({
        value: r.id,
        label: `${r.code} · ${r.hotelName}`,
        keywords: [r.code, r.hotelName, r.occupancyStatus, r.id],
        description: r.occupancyStatus.replaceAll("_", " "),
      }));
  }, [rooms, selectedStay?.roomId]);

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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}

      <p className="font-ui text-sm text-stone-500">
        <Link href="/dashboard/front-desk" className="text-teal-700 hover:underline">
          Front Desk
        </Link>
        {" · "}
        <Link href="/operations/consumption" className="text-teal-700 hover:underline">
          Consumo operacional
        </Link>
      </p>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th>Reserva</th>
                <th>Hóspede</th>
                <th>Quarto</th>
                <th>Saída prevista</th>
                <th>Acomp.</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stays.map((s) => (
                <tr
                  key={s.id}
                  className={`cursor-pointer ${selected === s.id ? "bg-teal-50/60" : ""}`}
                  onClick={() => {
                    setSelected(s.id);
                    setToRoomId("");
                  }}
                >
                  <td>{s.reservation.code}</td>
                  <td>
                    {s.guest.firstName} {s.guest.lastName}
                  </td>
                  <td>{s.room.code}</td>
                  <td>{String(s.expectedDeparture).slice(0, 10)}</td>
                  <td>{s.companions.length}</td>
                  <td>{s.status}</td>
                  <td>
                    <Link
                      href={`/stays/${s.id}`}
                      className="text-teal-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {stays.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500">
                    Sem estadias activas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
                Quarto destino
                <SearchableSelect
                  className="mt-1"
                  options={roomOptions}
                  value={toRoomId}
                  onChange={setToRoomId}
                  labels={{
                    placeholder: "Pesquisar quarto…",
                    searchPlaceholder: "Código, hotel, estado…",
                    empty: "Sem quartos disponíveis",
                  }}
                />
              </label>
              <label className="block text-sm">
                Motivo
                <input
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 py-2"
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
