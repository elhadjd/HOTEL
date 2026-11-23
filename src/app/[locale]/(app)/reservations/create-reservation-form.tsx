"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function CreateReservationForm({
  hotelId,
  rooms,
  guests,
}: {
  hotelId: string;
  rooms: Array<{ id: string; code: string }>;
  guests: Array<{ id: string; label: string; email?: string | null; phone?: string | null }>;
}) {
  const router = useRouter();
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [guestId, setGuestId] = useState(guests[0]?.id ?? "");
  const [adults, setAdults] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          arrivalDate,
          departureDate,
          adults: Number(adults) || 1,
          roomIds: roomId ? [roomId] : [],
          primaryGuestId: guestId || undefined,
          status: "PENDING",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface h-fit p-5">
      <h3 className="text-lg font-semibold text-ink-900">Nova reserva</h3>
      <div className="font-ui mt-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-stone-500">Chegada</span>
          <input
            type="date"
            required
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Partida</span>
          <input
            type="date"
            required
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Quarto</span>
          <SearchableSelect
            className="mt-1"
            options={rooms.map((r) => ({
              value: r.id,
              label: r.code,
              keywords: [r.code],
            }))}
            value={roomId}
            onChange={setRoomId}
            labels={{ placeholder: "Sem atribuição", searchPlaceholder: "Código do quarto…" }}
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Hóspede principal</span>
          <SearchableSelect
            className="mt-1"
            options={guests.map((g) => ({
              value: g.id,
              label: g.label,
              keywords: [g.email ?? "", g.phone ?? ""],
            }))}
            value={guestId}
            onChange={setGuestId}
            labels={{ placeholder: "Opcional", searchPlaceholder: "Nome, email, telefone…" }}
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Adultos</span>
          <input
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        {error ? <p className="text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "…" : "Criar reserva"}
        </Button>
      </div>
    </form>
  );
}
