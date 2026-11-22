"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Arrival = {
  id: string;
  code: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  hotel: { name: string; code: string };
  rooms: Array<{ room: { id: string; code: string; housekeepingStatus: string; category: { name: string } } }>;
  guests: Array<{
    isPrimary: boolean;
    guest: {
      id: string;
      firstName: string;
      lastName: string;
      customerMapping: { syncStatus: string; externalCustomerId: string | null } | null;
    };
  }>;
  stay: { id: string } | null;
};

export function CheckInClient({
  locale,
  initialArrivals,
}: {
  locale: string;
  initialArrivals: Arrival[];
}) {
  const [arrivals, setArrivals] = useState(initialArrivals);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/check-in");
      const data = await res.json();
      if (res.ok) setArrivals(data.arrivals ?? []);
    });
  }

  function doCheckIn(reservationId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-in failed");
        return;
      }
      setMessage(`Check-in concluído — stay ${data.stay?.id}`);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink-900">Chegadas</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-600">
            Prepare e confirme o check-in. Cada hóspede operacional deve ter cliente SIGESC Central ligado.
          </p>
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={refresh}>
          Actualizar
        </Button>
      </div>

      {error ? <p className="text-sm text-terracotta-700">{error}</p> : null}
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-3">Reserva</th>
              <th className="py-2 pr-3">Hóspede</th>
              <th className="py-2 pr-3">Cliente Central</th>
              <th className="py-2 pr-3">Quarto</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2">Acção</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.map((a) => {
              const primary = a.guests.find((g) => g.isPrimary) ?? a.guests[0];
              const linked =
                primary?.guest.customerMapping?.syncStatus === "LINKED" &&
                primary.guest.customerMapping.externalCustomerId;
              const room = a.rooms[0]?.room;
              const ready =
                !a.stay &&
                linked &&
                room &&
                room.housekeepingStatus === "CLEAN" &&
                ["CONFIRMED", "PENDING"].includes(a.status);
              return (
                <tr key={a.id} className="border-b border-stone-100 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-ink-900">{a.code}</div>
                    <div className="text-xs text-stone-500">{a.hotel.name}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {primary
                      ? `${primary.guest.firstName} ${primary.guest.lastName}`
                      : "—"}
                  </td>
                  <td className="py-3 pr-3">
                    {linked ? (
                      <span className="text-teal-800">Ligado</span>
                    ) : (
                      <span className="text-terracotta-700">Em falta</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {room ? (
                      <>
                        {room.code}
                        <div className="text-xs text-stone-500">
                          {room.category.name} · HK {room.housekeepingStatus}
                        </div>
                      </>
                    ) : (
                      "Sem quarto"
                    )}
                  </td>
                  <td className="py-3 pr-3">{a.stay ? "Já check-in" : a.status}</td>
                  <td className="py-3">
                    {a.stay ? (
                      <Link className="text-teal-800 underline" href={`/${locale}/stays`}>
                        Ver stay
                      </Link>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || !ready}
                        onClick={() => doCheckIn(a.id)}
                      >
                        Check-in
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {arrivals.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-stone-500">
                  Sem chegadas para hoje.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
