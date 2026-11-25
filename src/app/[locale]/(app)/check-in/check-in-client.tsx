"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

type Arrival = {
  id: string;
  code: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  hotel: { name: string; code: string };
  rooms: Array<{
    room: {
      id: string;
      code: string;
      housekeepingStatus: string;
      maintenanceStatus?: string;
      occupancyStatus?: string;
      capacity?: number;
      category: { name: string };
    };
  }>;
  guests: Array<{
    isPrimary: boolean;
    guest: {
      id: string;
      firstName: string;
      lastName: string;
      customerMapping: { syncStatus: string; externalCustomerId: string | null } | null;
    };
  }>;
  stays?: Array<{ id: string; roomId: string; status: string }>;
};

function eligibility(a: Arrival, chosenRoomId?: string | null) {
  const primary = a.guests.find((g) => g.isPrimary) ?? a.guests[0];
  const checkedRoomIds = new Set((a.stays ?? []).map((s) => s.roomId));
  const pendingRooms = a.rooms.filter((rr) => !checkedRoomIds.has(rr.room.id));
  const room =
    (chosenRoomId ? a.rooms.find((rr) => rr.room.id === chosenRoomId)?.room : null) ??
    pendingRooms[0]?.room ??
    a.rooms[0]?.room;
  const linked =
    primary?.guest.customerMapping?.syncStatus === "LINKED" &&
    Boolean(primary.guest.customerMapping?.externalCustomerId);
  const totalGuests = a.adults + (a.children ?? 0);
  const reasons: string[] = [];
  if (room && checkedRoomIds.has(room.id)) {
    reasons.push("Este quarto já tem estadia activa (check-in duplicado)");
  } else if (a.rooms.length > 0 && pendingRooms.length === 0) {
    reasons.push("Todos os quartos desta reserva já fizeram check-in");
  }
  if (!["CONFIRMED", "PENDING", "CHECKED_IN"].includes(a.status)) {
    reasons.push("Reserva não elegível");
  }
  if (!room) reasons.push("Sem quarto atribuído");
  if (room && room.housekeepingStatus !== "CLEAN") reasons.push("Quarto não CLEAN");
  if (room && room.maintenanceStatus && room.maintenanceStatus !== "OK") {
    reasons.push("Quarto em manutenção / fora de serviço");
  }
  if (room && room.occupancyStatus === "OCCUPIED") reasons.push("Quarto ocupado");
  if (!linked) reasons.push("Hóspede sem cliente SIGESC ligado");
  if (a.rooms.length <= 1 && room?.capacity != null && totalGuests > room.capacity) {
    reasons.push(`Capacidade excedida (${totalGuests} hóspedes > ${room.capacity})`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
    primary,
    room,
    linked,
    checkedRoomIds,
    pendingRooms,
  };
}

export function CheckInClient({
  initialArrivals,
  focusReservationId,
}: {
  locale?: string;
  initialArrivals: Arrival[];
  focusReservationId?: string;
}) {
  const router = useRouter();
  const [arrivals, setArrivals] = useState(initialArrivals);
  const [selectedId, setSelectedId] = useState(
    focusReservationId && initialArrivals.some((a) => a.id === focusReservationId)
      ? focusReservationId
      : initialArrivals[0]?.id ?? null,
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [resultStayId, setResultStayId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => arrivals.find((a) => a.id === selectedId) ?? null,
    [arrivals, selectedId],
  );
  const gate = selected ? eligibility(selected, selectedRoomId) : null;

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/check-in");
      const data = await res.json();
      if (res.ok) setArrivals(data.arrivals ?? []);
    });
  }

  function doCheckIn() {
    if (!selected || !gate?.ok || !gate.room) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: selected.id,
          roomId: gate.room!.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-in failed");
        return;
      }
      setResultStayId(data.stay?.id ?? null);
      setMessage("Check-in concluído");
      setStep(4);
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
          <h1 className="mt-1 text-3xl font-semibold text-ink-900">Check-in guiado</h1>
          <p className="font-ui mt-1 max-w-xl text-sm text-stone-600">
            Suporta reservas individuais e multi-quarto. O check-in lança automaticamente o
            alojamento na conta da estadia; documentos fiscais são geridos apenas no SIGESC.
          </p>
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={refresh}>
          Actualizar
        </Button>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <ol className="font-ui flex flex-wrap gap-2 text-xs uppercase tracking-wide text-stone-400">
        {[
          "1 · Reserva",
          "2 · Elegibilidade",
          "3 · Confirmar",
          "4 · Resultado",
        ].map((label, i) => (
          <li
            key={label}
            className={step === i + 1 ? "font-semibold text-teal-800" : undefined}
          >
            {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="surface overflow-hidden">
            {arrivals.length === 0 ? (
              <EmptyState title="Sem chegadas" description="Não há reservas para check-in." />
            ) : (
              <ul className="divide-y divide-sand-100">
                {arrivals.map((a) => {
                  const primary = a.guests.find((g) => g.isPrimary) ?? a.guests[0];
                  const roomSummary =
                    a.rooms.length > 1
                      ? `${a.rooms.length} quartos (${(a.stays ?? []).length} em estadia)`
                      : a.rooms[0]?.room.code ?? "sem quarto";
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        className={`w-full px-4 py-3 text-left hover:bg-sand-50 ${
                          selectedId === a.id ? "bg-teal-50" : ""
                        }`}
                        onClick={() => {
                          setSelectedId(a.id);
                          setSelectedRoomId(null);
                          setStep(1);
                          setResultStayId(null);
                        }}
                      >
                        <p className="font-medium text-ink-900">
                          {primary
                            ? `${primary.guest.firstName} ${primary.guest.lastName}`
                            : a.code}
                        </p>
                        <p className="font-ui text-xs text-stone-500">
                          {a.code} · {roomSummary}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected && gate ? (
            <div className="surface p-5">
              <h2 className="text-lg font-semibold">Resumo da reserva</h2>
              <dl className="font-ui mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-stone-500">Referência</dt>
                  <dd>{selected.code}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Hotel</dt>
                  <dd>{selected.hotel.name}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Hóspede</dt>
                  <dd>
                    {gate.primary
                      ? `${gate.primary.guest.firstName} ${gate.primary.guest.lastName}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Cliente central</dt>
                  <dd>{gate.linked ? "Ligado" : "Em falta"}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Datas</dt>
                  <dd>
                    {selected.arrivalDate.slice(0, 10)} → {selected.departureDate.slice(0, 10)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Hóspedes / quarto</dt>
                  <dd>
                    {selected.adults + (selected.children ?? 0)} ({selected.adults} ad.
                    {selected.children ? `, ${selected.children} cr.` : ""}) ·{" "}
                    {gate.room?.code ?? "—"} ({gate.room?.category.name})
                  </dd>
                </div>
              </dl>
              {selected.rooms.length > 1 ? (
                <label className="font-ui mt-4 block text-sm">
                  <span className="text-stone-500">Quarto para este check-in</span>
                  <select
                    value={gate.room?.id ?? ""}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  >
                    {selected.rooms.map((rr) => {
                      const alreadyIn = gate.checkedRoomIds.has(rr.room.id);
                      return (
                        <option key={rr.room.id} value={rr.room.id} disabled={alreadyIn}>
                          {rr.room.code} · {rr.room.category.name}
                          {alreadyIn ? " (já em estadia)" : ` (${rr.room.housekeepingStatus})`}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                <StatusPill value={selected.status} />
                {gate.room ? <StatusPill value={gate.room.housekeepingStatus} /> : null}
              </div>
              <Button type="button" className="mt-5" onClick={() => setStep(2)}>
                Validar elegibilidade
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 && selected && gate ? (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Validação (servidor + regras locais)</h2>
          {gate.ok ? (
            <p className="font-ui mt-3 text-sm text-teal-800">
              Elegível para check-in. O servidor revalida instituição, permissões, prontidão do
              quarto, cliente e conflitos.
            </p>
          ) : (
            <ul className="font-ui mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
              {gate.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button type="button" disabled={!gate.ok} onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && selected && gate ? (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Confirmar check-in</h2>
          <p className="font-ui mt-2 text-sm text-stone-600">
            {gate.primary?.guest.firstName} {gate.primary?.guest.lastName} → quarto{" "}
            {gate.room?.code} · {selected.code}
          </p>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button type="button" disabled={pending} onClick={doCheckIn}>
              {pending ? "A confirmar…" : "Confirmar check-in"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Check-in concluído</h2>
          <p className="font-ui mt-2 text-sm text-stone-600">
            Estadia criada. Não implica pagamento nem publicação de documento SIGESC.
          </p>
          {resultStayId ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/stays/${resultStayId}`}>
                <Button type="button">Abrir estadia activa</Button>
              </Link>
              <Link href="/dashboard/front-desk">
                <Button type="button" variant="secondary">
                  Front Desk
                </Button>
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
