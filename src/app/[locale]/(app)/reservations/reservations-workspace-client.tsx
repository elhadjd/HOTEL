"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  classifyReservationWindow,
  type HotelSchedulePolicy,
  type ReservationLifecycleBucket,
  timeToMinutes,
} from "@/modules/reservations/schedule";
import type { ReservationStatus } from "@prisma/client";

type ReservationItem = {
  id: string;
  code: string;
  status: ReservationStatus;
  arrivalDate: string;
  departureDate: string;
  expectedCheckInTime: string;
  expectedCheckOutTime: string;
  earlyCheckInRequested: boolean;
  lateCheckOutRequested: boolean;
  lateCheckOutApproved: boolean;
  isRetroactive: boolean;
  adults: number;
  children: number;
  operationalTotal: number | null;
  currency: string;
  rooms: Array<{ id: string; code: string; categoryName: string | null }>;
  primaryGuest: { id: string; name: string; phone: string | null } | null;
};

type RoomOption = {
  id: string;
  code: string;
  categoryName: string | null;
  occupancyStatus: string;
  housekeepingStatus: string;
};

type GuestOption = {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  linked: boolean;
};

type TabKey = "ALL" | ReservationLifecycleBucket;

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ReservationsWorkspaceClient({
  hotelId,
  todayIso,
  schedulePolicy,
  canWrite,
  canConfirm,
  canCheckIn,
  canRetroactive,
  initialReservations,
  rooms,
  guests,
}: {
  hotelId: string;
  todayIso: string;
  schedulePolicy: HotelSchedulePolicy;
  canWrite: boolean;
  canConfirm: boolean;
  canCheckIn: boolean;
  canRetroactive: boolean;
  initialReservations: ReservationItem[];
  rooms: RoomOption[];
  guests: GuestOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("ALL");
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // New reservation drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(todayIso);
  const [departureDate, setDepartureDate] = useState(addDaysIso(todayIso, 1));
  const [checkInTime, setCheckInTime] = useState(schedulePolicy.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(schedulePolicy.checkOutTime);
  const [roomId, setRoomId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [internalNotes, setInternalNotes] = useState("");
  const [allowRetroactive, setAllowRetroactive] = useState(false);

  // Reschedule / edit schedule modal
  const [editing, setEditing] = useState<ReservationItem | null>(null);
  const [editArrival, setEditArrival] = useState("");
  const [editDeparture, setEditDeparture] = useState("");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editLateApproved, setEditLateApproved] = useState(false);

  const todayDate = useMemo(() => new Date(`${todayIso}T00:00:00Z`), [todayIso]);

  const enriched = useMemo(
    () =>
      initialReservations.map((r) => ({
        ...r,
        window: classifyReservationWindow(
          {
            status: r.status,
            arrivalDate: r.arrivalDate,
            departureDate: r.departureDate,
          },
          todayDate,
        ),
      })),
    [initialReservations, todayDate],
  );

  const counts = useMemo(() => {
    const map: Record<TabKey, number> = {
      ALL: enriched.length,
      TODAY: 0,
      FUTURE: 0,
      IN_HOUSE: 0,
      OVERDUE: 0,
      HISTORY: 0,
    };
    for (const r of enriched) {
      map[r.window.bucket] += 1;
    }
    return map;
  }, [enriched]);

  const expiredCount = useMemo(
    () => enriched.filter((r) => r.window.bucket === "OVERDUE" && r.window.isExpired).length,
    [enriched],
  );

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (tab !== "ALL" && r.window.bucket !== tab) return false;
      if (!query) return true;
      const hay = [
        r.code,
        r.primaryGuest?.name ?? "",
        r.primaryGuest?.phone ?? "",
        ...r.rooms.map((rm) => rm.code),
        r.arrivalDate,
        r.departureDate,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [enriched, tab, q]);

  const isCreateEarlyCheckIn =
    timeToMinutes(checkInTime) < timeToMinutes(schedulePolicy.checkInTime);
  const isCreateLateCheckOut =
    timeToMinutes(checkOutTime) > timeToMinutes(schedulePolicy.checkOutTime);
  const isCreatePastDate = arrivalDate < todayIso;

  function createReservation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setWarnings([]);

    if (isCreatePastDate && !allowRetroactive) {
      setError(
        `A data de entrada (${arrivalDate}) está no passado. Escolha uma data a partir de ${todayIso}${
          canRetroactive ? ' ou active "Registo retroativo".' : "."
        }`,
      );
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/v1/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          arrivalDate,
          departureDate,
          expectedCheckInTime: checkInTime,
          expectedCheckOutTime: checkOutTime,
          allowRetroactive: canRetroactive && allowRetroactive,
          adults: Number(adults) || 1,
          children: Number(children) || 0,
          internalNotes: internalNotes.trim() || undefined,
          roomIds: roomId ? [roomId] : [],
          primaryGuestId: guestId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar reserva");
        return;
      }
      if (Array.isArray(data.scheduleWarnings) && data.scheduleWarnings.length > 0) {
        setWarnings(data.scheduleWarnings);
      }
      setMessage(
        `Reserva ${data.reservation?.code ?? ""} criada (${arrivalDate} ${checkInTime} → ${departureDate} ${checkOutTime}).`,
      );
      setCreateOpen(false);
      setRoomId("");
      setGuestId("");
      setInternalNotes("");
      setAllowRetroactive(false);
      router.refresh();
    });
  }

  function runAction(reservationId: string, action: "confirm" | "cancel" | "no-show") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/reservations/${reservationId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao executar acção na reserva");
        return;
      }
      setMessage(
        action === "confirm"
          ? "Reserva confirmada."
          : action === "no-show"
            ? "Reserva marcada como No-Show e quarto libertado."
            : "Reserva cancelada e quarto libertado.",
      );
      router.refresh();
    });
  }

  function openScheduleEditor(r: ReservationItem) {
    setError(null);
    setMessage(null);
    setEditing(r);
    setEditArrival(r.arrivalDate);
    setEditDeparture(r.departureDate);
    setEditCheckIn(r.expectedCheckInTime || schedulePolicy.checkInTime);
    setEditCheckOut(r.expectedCheckOutTime || schedulePolicy.checkOutTime);
    setEditLateApproved(r.lateCheckOutApproved);
  }

  function saveScheduleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/reservations/${editing.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arrivalDate: editing.status === "CHECKED_IN" ? undefined : editArrival,
          departureDate: editing.status === "CHECKED_IN" ? undefined : editDeparture,
          expectedCheckInTime: editCheckIn,
          expectedCheckOutTime: editCheckOut,
          lateCheckOutApproved: editLateApproved,
          allowRetroactive: canRetroactive && editArrival < todayIso,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar horário/datas");
        return;
      }
      if (Array.isArray(data.scheduleWarnings) && data.scheduleWarnings.length > 0) {
        setWarnings(data.scheduleWarnings);
      }
      setMessage(`Horário e datas da reserva ${editing.code} actualizados.`);
      setEditing(null);
      router.refresh();
    });
  }

  function reconcileExpired(markExpiredAsNoShow: boolean) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/reservations/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, markExpiredAsNoShow }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao reconciliar quartos");
        return;
      }
      setMessage(
        `Reconciliação concluída: ${data.roomsChecked} quartos verificados, ${data.roomsReleased} quarto(s) libertado(s)${
          data.expiredMarkedNoShow ? `, ${data.expiredMarkedNoShow} reserva(s) vencida(s) marcada(s) como No-Show` : ""
        }.`,
      );
      router.refresh();
    });
  }

  const tabs: Array<{ key: TabKey; label: string; alert?: boolean }> = [
    { key: "TODAY", label: "Chegadas Hoje" },
    { key: "FUTURE", label: "Futuras" },
    { key: "IN_HOUSE", label: "Em Curso" },
    { key: "OVERDUE", label: "Atrasadas / Vencidas", alert: counts.OVERDUE > 0 },
    { key: "HISTORY", label: "Histórico" },
    { key: "ALL", label: "Todas" },
  ];

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {message}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Alertas de horário e limpeza:</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Alert banner when overdue/expired reservations exist */}
      {counts.OVERDUE > 0 ? (
        <div className="surface flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-amber-500 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-ink-900">
                {counts.OVERDUE} reserva(s) com data de entrada anterior a hoje ({expiredCount}{" "}
                já expirada(s) após a data de saída)
              </p>
              <p className="text-stone-600">
                Reveja na aba <strong>Atrasadas / Vencidas</strong> para marcar No-Show, reagendar
                ou realizar check-in tardio — nenhuma reserva fica oculta nem deixa quartos presos.
              </p>
            </div>
          </div>
          {canConfirm ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setTab("OVERDUE")}
              >
                Ver atrasadas ({counts.OVERDUE})
              </Button>
              {expiredCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => reconcileExpired(true)}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Encerrar vencidas (No-Show) e libertar quartos
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Tabs + search + actions */}
      <div className="surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar -mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-ink-900 text-white"
                      : item.alert
                        ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                        : "bg-sand-100 text-stone-700 hover:bg-sand-200/70"
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-white/80 text-stone-700"
                    }`}
                  >
                    {counts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => reconcileExpired(false)}
                className="gap-1.5 text-stone-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronizar quartos
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setArrivalDate(todayIso);
                  setDepartureDate(addDaysIso(todayIso, 1));
                  setCheckInTime(schedulePolicy.checkInTime);
                  setCheckOutTime(schedulePolicy.checkOutTime);
                  setCreateOpen(true);
                }}
                className="w-full gap-2 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Nova reserva
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar por código, hóspede, quarto ou data…"
              className="h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Reservations responsive list (cards on mobile, table on desktop) */}
      <div className="surface overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState
            title="Sem reservas nesta vista"
            description="Ajuste o separador ou crie uma nova reserva."
          />
        ) : (
          <>
            <div className="divide-y divide-sand-100 md:hidden">
              {visible.map((r) => {
                const canLateCheckIn =
                  canCheckIn &&
                  ["CONFIRMED", "PENDING"].includes(r.status) &&
                  (r.window.bucket === "TODAY" || r.window.isLateArrivalEligible);
                return (
                  <div key={r.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-semibold text-ink-900">
                            {r.code}
                          </span>
                          {r.isRetroactive ? (
                            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                              Retroativa
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-sm font-medium text-stone-700">
                          {r.primaryGuest?.name ?? "Sem hóspede atribuído"}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <StatusPill value={r.status} />
                        {r.window.bucket === "OVERDUE" ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-danger">
                            {r.window.isExpired ? "Expirada" : "Atrasada"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-sand-50/80 p-2.5 text-xs">
                      <div>
                        <p className="text-stone-400">Datas</p>
                        <p className="font-medium tabular-nums text-ink-900">
                          {r.arrivalDate} → {r.departureDate}
                        </p>
                      </div>
                      <div>
                        <p className="text-stone-400">Quarto(s)</p>
                        <p className="font-mono font-medium text-ink-900">
                          {r.rooms.map((rm) => rm.code).join(", ") || "—"}
                        </p>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="inline-flex items-center gap-1 font-mono text-stone-600">
                          <Clock className="h-3 w-3 text-stone-400" />
                          IN {r.expectedCheckInTime} · OUT {r.expectedCheckOutTime}
                        </span>
                        {r.earlyCheckInRequested ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                            Early Check-in
                          </span>
                        ) : null}
                        {r.lateCheckOutRequested ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              r.lateCheckOutApproved
                                ? "bg-teal-100 text-teal-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {r.lateCheckOutApproved ? "Late aprovado" : "Late Check-out"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {canConfirm && ["DRAFT", "PENDING"].includes(r.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => runAction(r.id, "confirm")}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Confirmar
                        </Button>
                      ) : null}
                      {canLateCheckIn ? (
                        <Link
                          href={`/check-in?reservationId=${r.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-teal-600 px-2.5 text-xs font-medium text-white hover:bg-teal-500"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Check-in
                        </Link>
                      ) : null}
                      {canWrite &&
                      !["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(r.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => openScheduleEditor(r)}
                          className="gap-1"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Horário
                        </Button>
                      ) : null}
                      {canConfirm &&
                      ["DRAFT", "PENDING", "CONFIRMED"].includes(r.status) &&
                      r.window.bucket === "OVERDUE" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => runAction(r.id, "no-show")}
                          className="gap-1 text-amber-800 hover:bg-amber-50"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          No-Show
                        </Button>
                      ) : null}
                      {canConfirm &&
                      ["DRAFT", "PENDING", "CONFIRMED"].includes(r.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => runAction(r.id, "cancel")}
                          className="text-danger hover:bg-red-50"
                        >
                          Cancelar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="data-table min-w-[920px]">
                <thead>
                  <tr>
                    <th>Código / Hóspede</th>
                    <th>Estadia &amp; Horários</th>
                    <th>Quarto(s)</th>
                    <th>Estado</th>
                    <th className="text-right">Acções</th>
                  </tr>
                </thead>
              <tbody>
                {visible.map((r) => {
                  const canLateCheckIn =
                    canCheckIn &&
                    ["CONFIRMED", "PENDING"].includes(r.status) &&
                    (r.window.bucket === "TODAY" || r.window.isLateArrivalEligible);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-ink-900">
                            {r.code}
                          </span>
                          {r.isRetroactive ? (
                            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                              Retroativa
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-stone-700">
                          {r.primaryGuest?.name ?? "Sem hóspede atribuído"}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium tabular-nums text-ink-900">
                          {r.arrivalDate} → {r.departureDate}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3 text-stone-400" />
                            IN {r.expectedCheckInTime} · OUT {r.expectedCheckOutTime}
                          </span>
                          {r.earlyCheckInRequested ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              Early Check-in
                            </span>
                          ) : null}
                          {r.lateCheckOutRequested ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                r.lateCheckOutApproved
                                  ? "bg-teal-100 text-teal-900"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {r.lateCheckOutApproved
                                ? "Late Check-out aprovado"
                                : "Late Check-out"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="font-mono font-medium text-ink-900">
                          {r.rooms.map((rm) => rm.code).join(", ") || "—"}
                        </div>
                        <div className="text-xs text-stone-500">
                          {r.adults} ad.{r.children > 0 ? ` · ${r.children} cr.` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill value={r.status} />
                          {r.window.bucket === "OVERDUE" ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-danger">
                              {r.window.isExpired ? "Expirada (No-Show)" : "Chegada atrasada"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          {canConfirm && ["DRAFT", "PENDING"].includes(r.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              onClick={() => runAction(r.id, "confirm")}
                              className="gap-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Confirmar
                            </Button>
                          ) : null}
                          {canLateCheckIn ? (
                            <Link
                              href={`/check-in?reservationId=${r.id}`}
                              className="inline-flex h-8 items-center gap-1 rounded-md bg-teal-600 px-2.5 text-xs font-medium text-white hover:bg-teal-500"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              Check-in
                            </Link>
                          ) : null}
                          {canWrite &&
                          !["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(r.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => openScheduleEditor(r)}
                              className="gap-1"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              Horário
                            </Button>
                          ) : null}
                          {canConfirm &&
                          ["DRAFT", "PENDING", "CONFIRMED"].includes(r.status) &&
                          r.window.bucket === "OVERDUE" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => runAction(r.id, "no-show")}
                              className="gap-1 text-amber-800 hover:bg-amber-50"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              No-Show
                            </Button>
                          ) : null}
                          {canConfirm &&
                          ["DRAFT", "PENDING", "CONFIRMED"].includes(r.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => runAction(r.id, "cancel")}
                              className="text-danger hover:bg-red-50"
                            >
                              Cancelar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* Create Reservation Drawer */}
      <FormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        eyebrow="Reservas"
        title="Nova reserva"
        subtitle="Defina datas, horários de entrada/saída, quarto e hóspede."
        size="lg"
        onSubmit={createReservation}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A criar…" : "Criar reserva"}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 text-sm">
          {/* Dates */}
          <section className="surface space-y-3 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
              1. Datas da estadia
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Data de entrada *</span>
                <input
                  type="date"
                  required
                  min={allowRetroactive ? undefined : todayIso}
                  value={arrivalDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setArrivalDate(next);
                    if (departureDate <= next) {
                      setDepartureDate(addDaysIso(next, 1));
                    }
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Data de saída *</span>
                <input
                  type="date"
                  required
                  min={addDaysIso(arrivalDate || todayIso, 1)}
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                />
              </label>
            </div>
            {canRetroactive ? (
              <label className="flex items-center gap-2 pt-1 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={allowRetroactive}
                  onChange={(e) => setAllowRetroactive(e.target.checked)}
                  className="h-4 w-4 accent-teal-600"
                />
                Permitir registo retroativo (datas anteriores a hoje, apenas para histórico)
              </label>
            ) : null}
          </section>

          {/* Schedule times */}
          <section className="surface space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                2. Horários de entrada e saída
              </h4>
              <span className="text-[11px] text-stone-500">
                Padrão: {schedulePolicy.checkInTime} → {schedulePolicy.checkOutTime}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className="text-stone-600">Hora prevista de check-in</span>
                  <input
                    type="time"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    { label: "Early 11:00", value: "11:00" },
                    {
                      label: `Padrão ${schedulePolicy.checkInTime}`,
                      value: schedulePolicy.checkInTime,
                    },
                    { label: "Noite 20:00", value: "20:00" },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setCheckInTime(preset.value)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        checkInTime === preset.value
                          ? "bg-ink-900 text-white"
                          : "bg-sand-100 text-stone-600 hover:bg-sand-200"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {isCreateEarlyCheckIn ? (
                  <p className="mt-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900">
                    <Sparkles className="h-3 w-3" />
                    Early Check-in (antes das {schedulePolicy.checkInTime})
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block">
                  <span className="text-stone-600">Hora prevista de check-out</span>
                  <input
                    type="time"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    {
                      label: `Padrão ${schedulePolicy.checkOutTime}`,
                      value: schedulePolicy.checkOutTime,
                    },
                    { label: "Late 15:00", value: "15:00" },
                    {
                      label: `Máx ${schedulePolicy.lateCheckOutUntil}`,
                      value: schedulePolicy.lateCheckOutUntil,
                    },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setCheckOutTime(preset.value)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        checkOutTime === preset.value
                          ? "bg-ink-900 text-white"
                          : "bg-sand-100 text-stone-600 hover:bg-sand-200"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {isCreateLateCheckOut ? (
                  <p className="mt-2 inline-flex items-center gap-1 rounded bg-teal-100 px-2 py-1 text-[11px] font-medium text-teal-900">
                    <Clock className="h-3 w-3" />
                    Late Check-out (após as {schedulePolicy.checkOutTime})
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Room & Guest */}
          <section className="surface space-y-3 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
              3. Quarto e hóspede
            </h4>
            <div className="block">
              <span className="text-stone-600">Quarto</span>
              <SearchableSelect
                className="mt-1"
                options={rooms.map((rm) => ({
                  value: rm.id,
                  label: rm.code,
                  keywords: [rm.code, rm.categoryName ?? "", rm.occupancyStatus],
                  description: [rm.categoryName, rm.occupancyStatus, rm.housekeepingStatus]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                value={roomId}
                onChange={setRoomId}
                labels={{
                  placeholder: "Opcional (atribuir quarto)",
                  searchPlaceholder: "Pesquisar quarto ou categoria…",
                }}
              />
            </div>
            <div className="block">
              <span className="text-stone-600">Hóspede principal</span>
              <SearchableSelect
                className="mt-1"
                options={guests.map((g) => ({
                  value: g.id,
                  label: g.label,
                  keywords: [g.email ?? "", g.phone ?? ""],
                  description: [
                    g.phone || g.email || "",
                    g.linked ? "Cliente ligado" : "Sem cliente central",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                value={guestId}
                onChange={setGuestId}
                labels={{
                  placeholder: "Opcional (seleccionar hóspede)",
                  searchPlaceholder: "Nome, email ou telefone…",
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Adultos</span>
                <input
                  type="number"
                  min={1}
                  value={adults}
                  onChange={(e) => setAdults(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Crianças</span>
                <input
                  type="number"
                  min={0}
                  value={children}
                  onChange={(e) => setChildren(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-stone-600">Notas internas / pedidos especiais</span>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Ex.: Voo chega às 10h30, berço, transferência aeroporto…"
                className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2"
              />
            </label>
          </section>
        </div>
      </FormDrawer>

      {/* Reschedule & Schedule Editor Drawer */}
      <FormDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        eyebrow={editing?.code}
        title="Datas e horários"
        size="md"
        onSubmit={saveScheduleEdit}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A guardar…" : "Guardar alterações"}
            </Button>
          </div>
        }
      >
        {editing ? (
          <div className="surface space-y-4 p-4 text-sm">
            {editing.status !== "CHECKED_IN" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-stone-600">Entrada</span>
                  <input
                    type="date"
                    required
                    min={canRetroactive ? undefined : todayIso}
                    value={editArrival}
                    onChange={(e) => setEditArrival(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-stone-600">Saída</span>
                  <input
                    type="date"
                    required
                    min={addDaysIso(editArrival || todayIso, 1)}
                    value={editDeparture}
                    onChange={(e) => setEditDeparture(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                  />
                </label>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Hora de check-in</span>
                <input
                  type="time"
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Hora de check-out</span>
                <input
                  type="time"
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 pt-1 text-ink-900">
              <input
                type="checkbox"
                checked={editLateApproved}
                onChange={(e) => setEditLateApproved(e.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
              Aprovar Late Check-out (autorizado pela receção)
            </label>
          </div>
        ) : null}
      </FormDrawer>
    </div>
  );
}
