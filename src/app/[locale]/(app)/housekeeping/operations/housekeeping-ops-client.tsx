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
    housekeepingStatus: string;
    occupancyStatus: string;
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
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (hotelId ? tasks.filter((t) => t.hotel.id === hotelId) : tasks),
    [tasks, hotelId],
  );

  function refresh() {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (hotelId) params.set("hotelId", hotelId);
      const res = await fetch(`/api/v1/housekeeping?${params}`);
      const data = await res.json();
      if (res.ok) setTasks(JSON.parse(JSON.stringify(data.tasks ?? [])));
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Acção falhou");
        return;
      }
      setMessage("Actualizado");
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">Quadro de governança</h1>
          <p className="font-ui mt-1 text-sm text-stone-500">
            Limpeza → conclusão → inspecção → CLEAN. Só após inspecção aprovada o quarto fica
            pronto.
          </p>
        </div>
        <SearchableSelect
          className="w-56"
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={(v) => {
            setHotelId(v);
          }}
          clearable={false}
        />
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="surface flex flex-wrap items-end gap-2 p-4">
        <label className="font-ui block text-xs text-stone-500">
          Atribuir a
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="mt-1 h-10 w-48 rounded-md border border-sand-200 bg-white px-3 text-sm"
            placeholder="Colaborador"
          />
        </label>
        <p className="font-ui text-xs text-stone-400">
          Use «Atribuir» numa tarefa com o nome preenchido.
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sem tarefas" description="Nenhuma tarefa de governança aberta." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => (
            <li
              key={t.id}
              id={`task-${t.id}`}
              className={`surface p-4 ${focusTaskId === t.id ? "ring-2 ring-teal-500" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {t.hotel.name} · Quarto {t.room.code}
                  </p>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {t.kind} · prioridade {t.priority}
                    {t.assignedTo ? ` · ${t.assignedTo}` : " · sem atribuição"}
                    {t.deadlineAt ? ` · prazo ${new Date(t.deadlineAt).toLocaleString("pt-PT")}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusPill value={t.status} />
                    <StatusPill value={`HK ${t.room.housekeepingStatus}`} />
                    <StatusPill value={t.room.occupancyStatus} />
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending || !assignee.trim()}
                    onClick={() => act(t.id, { action: "assign", assignedTo: assignee.trim() })}
                  >
                    Atribuir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => act(t.id, { action: "start" })}
                  >
                    Iniciar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => act(t.id, { action: "complete" })}
                  >
                    Concluir
                  </Button>
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
                    disabled={pending}
                    onClick={() => act(t.id, { action: "inspect", approved: false })}
                  >
                    Rejeitar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
