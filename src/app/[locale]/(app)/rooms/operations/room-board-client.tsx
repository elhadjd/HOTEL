"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { cn } from "@/shared/utils";

type RoomCard = {
  id: string;
  code: string;
  floor: string | null;
  categoryName: string;
  hotelName: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  readyForCheckIn: boolean;
  guest: { id: string; name: string } | null;
  stayId: string | null;
  reservationId: string | null;
  reservationCode: string | null;
  expectedDeparture: string | null;
  openHousekeepingTaskId: string | null;
  openMaintenanceRequestId: string | null;
  blocksAllocation: boolean;
};

function toneForRoom(room: RoomCard) {
  if (room.maintenanceStatus !== "OK") return "border-l-amber-700 bg-amber-50/40";
  if (room.housekeepingStatus === "DIRTY") return "border-l-stone-500 bg-stone-50";
  if (room.housekeepingStatus === "CLEANING" || room.housekeepingStatus === "INSPECTING") {
    return "border-l-sky-600 bg-sky-50/50";
  }
  if (room.occupancyStatus === "OCCUPIED") return "border-l-teal-700 bg-teal-50/40";
  if (room.readyForCheckIn) return "border-l-emerald-600 bg-emerald-50/30";
  return "border-l-sand-300 bg-white";
}

export function RoomBoardClient({
  initialRooms,
  hotels,
  categories,
}: {
  initialRooms: RoomCard[];
  hotels: SearchableOption[];
  categories: SearchableOption[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [hotelId, setHotelId] = useState("");
  const [floor, setFloor] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [housekeeping, setHousekeeping] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const floors = useMemo(() => {
    const set = new Set(rooms.map((r) => r.floor).filter(Boolean) as string[]);
    return [...set].sort().map((f) => ({ value: f, label: `Andar ${f}` }));
  }, [rooms]);

  const load = useCallback(() => {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (hotelId) params.set("hotelId", hotelId);
      if (floor) params.set("floor", floor);
      if (categoryId) params.set("categoryId", categoryId);
      if (occupancy) params.set("occupancyStatus", occupancy);
      if (housekeeping) params.set("housekeepingStatus", housekeeping);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/v1/rooms/operations?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar quartos");
        return;
      }
      setRooms(data.rooms ?? []);
      setError(null);
    });
  }, [hotelId, floor, categoryId, occupancy, housekeeping, q]);

  useEffect(() => {
    load();
  }, [load]);

  const roomOptions = useMemo(
    () =>
      rooms.map((r) => ({
        value: r.id,
        label: `${r.code} · ${r.categoryName}`,
        keywords: [r.hotelName, r.floor ?? "", r.guest?.name ?? ""],
      })),
    [rooms],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">Quartos</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink-900">Operações de quartos</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
          Prontidão = AVAILABLE + CLEAN + manutenção OK. Ocupação AVAILABLE sozinha não autoriza
          check-in.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}

      <div className="surface grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
        <SearchableSelect
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={setHotelId}
          clearable={false}
          labels={{ placeholder: "Hotel" }}
        />
        <SearchableSelect
          options={[{ value: "", label: "Todos os andares" }, ...floors]}
          value={floor}
          onChange={setFloor}
          clearable={false}
          labels={{ placeholder: "Andar" }}
        />
        <SearchableSelect
          options={[{ value: "", label: "Todas categorias" }, ...categories]}
          value={categoryId}
          onChange={setCategoryId}
          clearable={false}
          labels={{ placeholder: "Categoria" }}
        />
        <select
          value={occupancy}
          onChange={(e) => setOccupancy(e.target.value)}
          className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
        >
          <option value="">Ocupação</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="OCCUPIED">OCCUPIED</option>
          <option value="RESERVED">RESERVED</option>
        </select>
        <select
          value={housekeeping}
          onChange={(e) => setHousekeeping(e.target.value)}
          className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
        >
          <option value="">Governança</option>
          <option value="CLEAN">CLEAN</option>
          <option value="DIRTY">DIRTY</option>
          <option value="CLEANING">CLEANING</option>
          <option value="INSPECTING">INSPECTING</option>
        </select>
        <SearchableSelect
          options={roomOptions}
          value=""
          onChange={(id) => {
            if (!id) return;
            const el = document.getElementById(`room-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          labels={{ placeholder: "Ir para quarto…", searchPlaceholder: "Código…" }}
        />
        <label className="md:col-span-2 xl:col-span-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar código / categoria…"
            className="h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
          />
        </label>
        <Button type="button" variant="secondary" disabled={pending} onClick={load}>
          Filtrar
        </Button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState title="Sem quartos" description="Ajuste os filtros ou configure o hotel." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rooms.map((room) => (
            <article
              key={room.id}
              id={`room-${room.id}`}
              className={cn(
                "rounded-md border border-sand-200 border-l-4 p-4 shadow-[var(--shadow-soft)]",
                toneForRoom(room),
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold text-ink-900">{room.code}</h3>
                  <p className="font-ui text-xs text-stone-500">
                    {room.hotelName} · {room.categoryName}
                    {room.floor ? ` · Andar ${room.floor}` : ""}
                  </p>
                </div>
                {room.readyForCheckIn ? (
                  <span className="font-ui rounded bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-800">
                    Pronto
                  </span>
                ) : room.blocksAllocation ? (
                  <span className="font-ui rounded bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-900">
                    Bloqueado
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <StatusPill value={room.occupancyStatus} />
                <StatusPill value={room.housekeepingStatus} />
                <StatusPill value={room.maintenanceStatus} />
              </div>
              {room.guest ? (
                <p className="font-ui mt-3 text-sm text-ink-800">
                  {room.guest.name}
                  {room.expectedDeparture
                    ? ` · sai ${room.expectedDeparture.slice(0, 10)}`
                    : ""}
                </p>
              ) : (
                <p className="font-ui mt-3 text-sm text-stone-400">Sem hóspede</p>
              )}
              <div className="font-ui mt-3 flex flex-wrap gap-2 text-xs">
                {room.stayId ? (
                  <Link href={`/stays/${room.stayId}`} className="text-teal-700 hover:underline">
                    Estadia
                  </Link>
                ) : null}
                {room.reservationCode ? (
                  <span className="text-stone-500">{room.reservationCode}</span>
                ) : null}
                <Link
                  href={`/housekeeping/operations?roomId=${room.id}`}
                  className="text-teal-700 hover:underline"
                >
                  Governança
                </Link>
                <Link
                  href={`/maintenance/operations?roomId=${room.id}`}
                  className="text-teal-700 hover:underline"
                >
                  Manutenção
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
