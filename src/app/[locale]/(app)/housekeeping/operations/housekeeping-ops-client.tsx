"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Task = {
  id: string;
  kind: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  createdAt: string;
  deadlineAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
  inspectionResult: string | null;
  notes: string | null;
  room: {
    id: string;
    code: string;
    floor: string | null;
    housekeepingStatus: string;
    occupancyStatus: string;
    maintenanceStatus?: string;
  };
  hotel: { id: string; name: string };
};

export function HousekeepingOpsClient({
  initialTasks,
  hotels,
  focusTaskId,
}: {
  initialTasks: Task[];
  hotels: SearchableOption[];
  focusTaskId?: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [hotelId, setHotelId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [floor, setFloor] = useState("");
  const [assignee, setAssignee] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (hotelId && t.hotel.id !== hotelId) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (floor && (t.room.floor ?? "") !== floor) return false;
      return true;
    });
  }, [tasks, hotelId, statusFilter, floor]);

  const floors = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.room.floor) set.add(t.room.floor);
    }
    return [...set].sort();
  }, [tasks]);

  async function fetchTasks() {
    const params = new URLSearchParams();
    if (hotelId) params.set("hotelId", hotelId);
    if (statusFilter) params.set("status", statusFilter);
    if (floor) params.set("floor", floor);
    const res = await fetch(`/api/v1/housekeeping?${params}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setTasks(JSON.parse(JSON.stringify(data.tasks ?? [])));
  }

  function refresh() {
    startTransition(async () => {
      await fetchTasks();
    });
  }

  function act(taskId: string, body: object) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/housekeeping/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Acção falhou");
        await fetchTasks();
        return;
      }
      setMessage("Actualizado");
      await fetchTasks();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">Quadro de governança</h1>
          <p className="font-ui mt-1 text-sm text-stone-500">
            Limpeza → conclusão → inspecção → CLEAN. Um quarto sujo nunca é apresentado como
            pronto. Conclusão sem inspecção (política explícita) também marca CLEAN.
          </p>
        </div>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SearchableSelect
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={setHotelId}
          clearable={false}
        />
        <select
          className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os estados</option>
          {[
            "PENDING",
            "ASSIGNED",
            "IN_PROGRESS",
            "INSPECTION_REQUIRED",
            "COMPLETED",
            "REJECTED",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        >
          <option value="">Todos os andares</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              Andar {f}
            </option>
          ))}
        </select>
        <label className="font-ui block text-xs text-stone-500">
          Responsável (para atribuir)
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            placeholder="Colaborador"
          />
        </label>
        <label className="font-ui block text-xs text-stone-500 sm:col-span-2">
          Motivo de rejeição (obrigatório ao rejeitar inspecção)
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
            placeholder="Ex.: casa de banho por limpar"
          />
        </label>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={refresh}>
          Actualizar lista
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sem tarefas" description="Nenhuma tarefa de governança aberta." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => {
            const canAssign = !["COMPLETED", "CANCELLED"].includes(t.status);
            const canStart = ["PENDING", "ASSIGNED", "REJECTED"].includes(t.status);
            const canComplete = ["IN_PROGRESS", "ASSIGNED"].includes(t.status);
            const canInspect = t.status === "INSPECTION_REQUIRED";
            const canReopen = [
              "COMPLETED",
              "REJECTED",
              "CANCELLED",
              "INSPECTION_REQUIRED",
            ].includes(t.status);

            return (
              <li
                key={t.id}
                id={`task-${t.id}`}
                className={`surface p-4 ${focusTaskId === t.id ? "ring-2 ring-teal-500" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">
                      {t.hotel.name} · Quarto {t.room.code}
                      {t.room.floor ? ` · Andar ${t.room.floor}` : ""}
                    </p>
                    <p className="font-ui mt-1 text-xs text-stone-500">
                      {t.kind} · prioridade {t.priority}
                      {t.assignedTo ? ` · ${t.assignedTo}` : " · sem atribuição"}
                      {t.deadlineAt
                        ? ` · prazo ${new Date(t.deadlineAt).toLocaleString("pt-PT")}`
                        : ""}
                      {t.startedAt
                        ? ` · início ${new Date(t.startedAt).toLocaleString("pt-PT")}`
                        : ""}
                      {t.completedAt
                        ? ` · fim ${new Date(t.completedAt).toLocaleString("pt-PT")}`
                        : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusPill value={t.status} />
                      <StatusPill value={`HK ${t.room.housekeepingStatus}`} />
                      <StatusPill value={t.room.occupancyStatus} />
                      {t.room.maintenanceStatus ? (
                        <StatusPill value={`M ${t.room.maintenanceStatus}`} />
                      ) : null}
                    </div>
                    {t.inspectionResult ? (
                      <p className="font-ui mt-2 text-xs text-stone-500">
                        Inspecção: {t.inspectionResult}
                        {t.inspectedAt
                          ? ` · ${new Date(t.inspectedAt).toLocaleString("pt-PT")}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canAssign ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || !assignee.trim()}
                        onClick={() => act(t.id, { action: "assign", assignedTo: assignee.trim() })}
                      >
                        Atribuir
                      </Button>
                    ) : null}
                    {canStart ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={t.status === "PENDING" || t.status === "REJECTED" ? "default" : "secondary"}
                        disabled={pending}
                        onClick={() => act(t.id, { action: "start" })}
                      >
                        Iniciar
                      </Button>
                    ) : null}
                    {canComplete ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => act(t.id, { action: "complete", requireInspection: true })}
                        >
                          Concluir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => act(t.id, { action: "complete", requireInspection: false })}
                        >
                          Concluir (CLEAN)
                        </Button>
                      </>
                    ) : null}
                    {canInspect ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => act(t.id, { action: "inspect", approved: true })}
                        >
                          Aprovar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending || !rejectReason.trim()}
                          onClick={() =>
                            act(t.id, {
                              action: "inspect",
                              approved: false,
                              notes: rejectReason.trim(),
                            })
                          }
                        >
                          Rejeitar
                        </Button>
                      </>
                    ) : null}
                    {canReopen ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => act(t.id, { action: "reopen" })}
                      >
                        Reabrir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
