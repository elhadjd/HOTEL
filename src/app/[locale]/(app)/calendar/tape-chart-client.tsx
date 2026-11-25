"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

export type TapeChartRoom = {
  id: string;
  code: string;
  floor: string | null;
  categoryName: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
};

export type TapeChartBooking = {
  reservationId: string;
  code: string;
  status: string;
  roomId: string;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string; // YYYY-MM-DD
  guestName: string;
  stayId: string | null;
};

function statusBarClass(status: string): string {
  switch (status) {
    case "CHECKED_IN":
      return "bg-ink-900 text-white border-ink-900";
    case "CONFIRMED":
      return "bg-teal-600 text-white border-teal-700";
    case "PENDING":
      return "bg-amber-200 text-amber-950 border-amber-400";
    case "CHECKED_OUT":
      return "bg-stone-200 text-stone-700 border-stone-300";
    default:
      return "bg-sand-200 text-ink-900 border-sand-300";
  }
}

export function TapeChartClient({
  hotelId,
  rooms,
  days,
  todayKey,
  bookings,
}: {
  hotelId: string;
  rooms: TapeChartRoom[];
  days: string[]; // YYYY-MM-DD[]
  todayKey: string;
  bookings: TapeChartBooking[];
}) {
  const [selected, setSelected] = useState<TapeChartBooking | null>(null);

  if (rooms.length === 0) {
    return (
      <div className="surface p-6 text-sm text-stone-500">
        Nenhum quarto activo neste hotel. Crie quartos em{" "}
        <Link href={`/rooms?hotelId=${hotelId}`} className="text-teal-700 underline">
          Quartos
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="font-ui flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-ink-900" /> Em estadia (Checked-in)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-teal-600" /> Confirmada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-300" /> Pendente
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-stone-300" /> Check-out
        </span>
      </div>

      <div className="surface overflow-x-auto">
        <table className="font-ui w-full min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-sand-200 bg-sand-50/90 text-[11px] uppercase tracking-wide text-stone-500">
              <th className="sticky left-0 z-10 w-44 border-r border-sand-200 bg-sand-50 px-3 py-2.5 text-left">
                Quarto
              </th>
              {days.map((d) => {
                const isToday = d === todayKey;
                return (
                  <th
                    key={d}
                    className={`min-w-[54px] border-r border-sand-100 px-1.5 py-2 text-center ${
                      isToday ? "bg-teal-50 font-semibold text-teal-900" : ""
                    }`}
                  >
                    <div>{d.slice(8, 10)}</div>
                    <div className="text-[10px] font-normal text-stone-400">{d.slice(5, 7)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const roomBookings = bookings.filter((b) => b.roomId === room.id);
              const blocked = room.maintenanceStatus !== "OK";

              return (
                <tr key={room.id} className="border-b border-sand-100">
                  <td className="sticky left-0 z-10 border-r border-sand-200 bg-white px-3 py-2 align-middle">
                    <div className="font-medium text-ink-900">
                      {room.code}
                      {room.floor ? (
                        <span className="ml-1 text-[10px] text-stone-400">· {room.floor}</span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      {room.categoryName} · {room.housekeepingStatus}
                      {blocked ? ` · ${room.maintenanceStatus}` : ""}
                    </div>
                  </td>

                  {days.map((day) => {
                    const booking = roomBookings.find(
                      (b) => b.arrivalDate <= day && b.departureDate > day,
                    );
                    const isStart = booking?.arrivalDate === day;
                    const isToday = day === todayKey;

                    if (booking) {
                      return (
                        <td
                          key={day}
                          className={`border-r border-sand-100 p-0.5 align-middle ${
                            isToday ? "bg-teal-50/40" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelected(booking)}
                            title={`${booking.code} · ${booking.guestName} (${booking.arrivalDate} → ${booking.departureDate})`}
                            className={`block h-8 w-full truncate rounded border px-1.5 text-left text-[11px] font-medium transition hover:opacity-90 ${statusBarClass(booking.status)}`}
                          >
                            {isStart ? booking.guestName.split(" ")[0] : "·"}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={day}
                        className={`border-r border-sand-100 p-0.5 text-center ${
                          blocked
                            ? "bg-red-50/60"
                            : isToday
                              ? "bg-teal-50/30"
                              : "hover:bg-sand-50"
                        }`}
                      >
                        {blocked ? (
                          <span className="text-[10px] text-red-400" title={room.maintenanceStatus}>
                            ×
                          </span>
                        ) : (
                          <Link
                            href={`/reservations?hotelId=${hotelId}`}
                            title={`Livre em ${day} · criar reserva`}
                            className="block h-8 w-full rounded hover:bg-teal-100/40"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="surface flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink-900">
                {selected.code} · {selected.guestName}
              </p>
              <StatusPill value={selected.status} />
            </div>
            <p className="font-ui text-xs text-stone-500">
              {selected.arrivalDate} → {selected.departureDate} · Quarto{" "}
              {rooms.find((r) => r.id === selected.roomId)?.code ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.stayId ? (
              <Link href={`/stays/${selected.stayId}`}>
                <Button type="button" size="sm">
                  Abrir estadia
                </Button>
              </Link>
            ) : ["CONFIRMED", "PENDING"].includes(selected.status) ? (
              <Link href={`/check-in?reservationId=${selected.reservationId}`}>
                <Button type="button" size="sm">
                  Fazer check-in
                </Button>
              </Link>
            ) : null}
            <Link href={`/reservations?hotelId=${hotelId}`}>
              <Button type="button" size="sm" variant="secondary">
                Ver reservas
              </Button>
            </Link>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setSelected(null)}
            >
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
