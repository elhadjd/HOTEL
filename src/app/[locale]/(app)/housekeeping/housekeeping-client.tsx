"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  kind: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  room: { code: string; housekeepingStatus: string };
  hotel: { name: string };
};

export function HousekeepingClient({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function fetchTasks() {
    const res = await fetch("/api/v1/housekeeping", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setTasks(data.tasks ?? []);
  }

  function act(taskId: string, body: object) {
    setError(null);
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
      await fetchTasks();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink-900">Governança</h1>
        <p className="mt-1 text-sm text-stone-600">
          Limpeza, inspecção e prontidão do quarto — separada da ocupação.
        </p>
      </div>
      {error ? <p className="text-sm text-terracotta-700">{error}</p> : null}
      <ul className="space-y-3">
        {tasks.map((t) => {
          const canStart = ["PENDING", "ASSIGNED", "REJECTED"].includes(t.status);
          const canComplete = ["IN_PROGRESS", "ASSIGNED"].includes(t.status);
          const canInspect = t.status === "INSPECTION_REQUIRED";
          return (
            <li key={t.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-ink-900">
                  {t.hotel.name} · Quarto {t.room.code}
                </p>
                <p className="text-xs text-stone-500">
                  {t.kind} · {t.status} · prioridade {t.priority} · HK quarto {t.room.housekeepingStatus}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canStart ? (
                  <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => act(t.id, { action: "start" })}>
                    Iniciar
                  </Button>
                ) : null}
                {canComplete ? (
                  <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => act(t.id, { action: "complete" })}>
                    Concluir
                  </Button>
                ) : null}
                {canInspect ? (
                  <Button type="button" size="sm" disabled={pending} onClick={() => act(t.id, { action: "inspect", approved: true })}>
                    Aprovar
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
        {tasks.length === 0 ? <li className="text-sm text-stone-500">Sem tarefas.</li> : null}
      </ul>
    </div>
  );
}
