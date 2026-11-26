"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Snapshot = {
  date: string;
  hotelId: string | null;
  metrics: Record<string, number>;
  roomReadiness: Record<string, number>;
  arrivals: Array<{
    reservationId: string;
    code: string;
    status: string;
    arrivalDate: string;
    departureDate: string;
    guestName: string;
    customerLinked: boolean;
    roomCode: string | null;
    categoryName: string | null;
    stayId: string | null;
    checkInEligible: boolean;
  }>;
  departures: Array<{
    stayId: string;
    guestName: string;
    roomCode: string;
    expectedDeparture: string;
    status: string;
    operationalChargesTotal: number;
    invoice: { id: string; externalId: string; centralState: string | null } | null;
    checkOutEligible: boolean;
  }>;
  currentGuests: Array<{
    stayId: string;
    guestName: string;
    roomCode: string;
    arrival: string;
    expectedDeparture: string;
    nights: number;
    status: string;
    invoice: { id: string; externalId: string; centralState: string | null } | null;
  }>;
  alerts: Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    href: string;
  }>;
};

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="surface p-4">
      <p className="font-ui text-[11px] uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="font-ui mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function dateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function shiftDate(isoDate: string, delta: number) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function FrontDeskClient({
  initial,
  hotels,
}: {
  initial: Snapshot;
  hotels: SearchableOption[];
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [hotelId, setHotelId] = useState(initial.hotelId ?? "");
  const [date, setDate] = useState(dateInputValue(initial.date));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (nextHotel: string, nextDate: string) => {
      startTransition(async () => {
        const params = new URLSearchParams();
        if (nextHotel) params.set("hotelId", nextHotel);
        if (nextDate) params.set("date", nextDate);
        const res = await fetch(`/api/v1/front-desk?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao actualizar Front Desk");
          return;
        }
        setSnapshot(data.snapshot);
        setError(null);
      });
    },
    [],
  );

  useEffect(() => {
    load(hotelId, date);
  }, [hotelId, date, load]);

  const m = snapshot.metrics;
  const rr = snapshot.roomReadiness;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
            Recepção
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">Front Desk</h1>
          <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
            Visão operacional do dia — chegadas, partidas, ocupação e prontidão de quartos.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          {hotels.length > 1 ? (
            <div className="font-ui block w-full text-xs text-stone-500 sm:w-56">
              <span>Hotel</span>
              <SearchableSelect
                className="mt-1 w-full"
                options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
                value={hotelId}
                onChange={setHotelId}
                clearable={false}
                labels={{ placeholder: "Todos" }}
              />
            </div>
          ) : null}
          <label className="font-ui block text-xs text-stone-500">
            Data
            <div className="mt-1 flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Dia anterior"
                onClick={() => setDate((d) => shiftDate(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Dia seguinte"
                onClick={() => setDate((d) => shiftDate(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </label>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={pending}
            onClick={() => load(hotelId, date)}
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        <Metric label="Chegadas" value={m.arrivalsToday} />
        <Metric label="Partidas" value={m.departuresToday} />
        <Metric label="Hóspedes in-house" value={m.guestsCurrentlyStaying} />
        <Metric label="Prontos p/ check-in" value={m.readyRooms} hint="AVAILABLE + CLEAN + OK" />
        <Metric label="Ocupados" value={m.occupiedRooms} />
        <Metric label="Sujos" value={m.dirtyRooms} />
        <Metric label="Manutenção" value={m.underMaintenanceRooms + m.outOfServiceRooms} />
        <Metric label="Check-ins pendentes" value={m.pendingCheckIns} />
        <Metric label="Check-outs do dia" value={m.pendingCheckOuts} />
        <Metric label="Tarefas HK abertas" value={m.housekeepingAwaitingAction} />
        <Metric label="Manutenções activas" value={m.activeMaintenanceRequests} />
        <Metric label="Disponíveis (ocupação)" value={m.availableRooms} hint="Não implica prontidão" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink-900">Chegadas esperadas</h2>
            <Link href="/check-in" className="font-ui text-sm text-teal-700 hover:underline">
              Check-in guiado
            </Link>
          </div>
          {snapshot.arrivals.length === 0 ? (
            <EmptyState title="Sem chegadas" description="Nenhuma reserva para esta data." />
          ) : (
            <ul className="divide-y divide-sand-100">
              {snapshot.arrivals.map((a) => (
                <li key={a.reservationId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium text-ink-900">{a.guestName}</p>
                    <p className="font-ui text-xs text-stone-500">
                      {a.code} · {a.roomCode ?? "sem quarto"}
                      {a.categoryName ? ` · ${a.categoryName}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusPill value={a.status} />
                      <StatusPill value={a.customerLinked ? "Cliente ligado" : "Sem cliente"} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/reservations`}
                      className="font-ui text-sm text-teal-700 hover:underline"
                    >
                      Ver
                    </Link>
                    {a.checkInEligible ? (
                      <Link
                        href={`/check-in?reservationId=${a.reservationId}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-teal-800"
                      >
                        <LogIn className="h-3.5 w-3.5" /> Check-in
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink-900">Partidas esperadas</h2>
            <Link href="/check-out" className="font-ui text-sm text-teal-700 hover:underline">
              Check-out guiado
            </Link>
          </div>
          {snapshot.departures.length === 0 ? (
            <EmptyState title="Sem partidas" description="Nenhuma estadia a sair nesta data." />
          ) : (
            <ul className="divide-y divide-sand-100">
              {snapshot.departures.map((d) => (
                <li key={d.stayId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium text-ink-900">{d.guestName}</p>
                    <p className="font-ui text-xs text-stone-500">
                      Quarto {d.roomCode} · cargos op. {d.operationalChargesTotal.toFixed(2)} AOA
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusPill value={d.status} />
                      {d.invoice ? (
                        <StatusPill value={d.invoice.centralState ?? d.invoice.externalId} />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/stays/${d.stayId}`} className="font-ui text-sm text-teal-700 hover:underline">
                      Estadia
                    </Link>
                    {d.checkOutEligible ? (
                      <Link
                        href={`/check-out?stayId=${d.stayId}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-teal-800"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Check-out
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Hóspedes actuais</h2>
          <Link href="/stays" className="font-ui text-sm text-teal-700 hover:underline">
            Todas as estadias
          </Link>
        </div>
        {snapshot.currentGuests.length === 0 ? (
          <EmptyState title="Sem hóspedes in-house" description="Nenhuma estadia activa." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Hóspede</th>
                  <th>Quarto</th>
                  <th>Chegada</th>
                  <th>Partida</th>
                  <th>Noites</th>
                  <th>Documento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.currentGuests.map((g) => (
                  <tr key={g.stayId}>
                    <td>
                      <div className="font-medium">{g.guestName}</div>
                      <StatusPill value={g.status} />
                    </td>
                    <td>{g.roomCode}</td>
                    <td className="text-xs">{new Date(g.arrival).toLocaleString("pt-PT")}</td>
                    <td className="text-xs">{g.expectedDeparture.slice(0, 10)}</td>
                    <td>{g.nights}</td>
                    <td className="text-xs">
                      {g.invoice ? (
                        <Link
                          href={`/integrations/invoices/${g.invoice.id}`}
                          className="text-teal-700 hover:underline"
                        >
                          {g.invoice.externalId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link href={`/stays/${g.stayId}`} className="text-teal-700 hover:underline">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Prontidão de quartos</h2>
            <Link href="/rooms/operations" className="font-ui text-sm text-teal-700 hover:underline">
              Quadro de quartos
            </Link>
          </div>
          <dl className="font-ui grid grid-cols-2 gap-3 text-sm">
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Prontos</dt>
              <dd className="text-xl font-semibold">{rr.ready}</dd>
            </div>
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Sujos</dt>
              <dd className="text-xl font-semibold">{rr.dirty}</dd>
            </div>
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Em limpeza</dt>
              <dd className="text-xl font-semibold">{rr.cleaning}</dd>
            </div>
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Inspecção</dt>
              <dd className="text-xl font-semibold">{rr.inspecting}</dd>
            </div>
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Fora de serviço</dt>
              <dd className="text-xl font-semibold">{rr.outOfService}</dd>
            </div>
            <div className="surface-muted p-3">
              <dt className="text-stone-500">Manutenção</dt>
              <dd className="text-xl font-semibold">{rr.underMaintenance}</dd>
            </div>
          </dl>
        </section>

        <section className="surface p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink-900">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            Alertas operacionais
          </h2>
          {snapshot.alerts.length === 0 ? (
            <p className="font-ui text-sm text-stone-500">Sem alertas para esta data/hotel.</p>
          ) : (
            <ul className="space-y-2">
              {snapshot.alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="font-ui flex items-start justify-between gap-2 rounded-md border border-sand-100 px-3 py-2 text-sm hover:bg-sand-50"
                  >
                    <span>
                      <span className="mr-2 text-[10px] uppercase tracking-wide text-stone-400">
                        {a.severity}
                      </span>
                      {a.title}
                    </span>
                    <span className="shrink-0 text-teal-700">Abrir</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
