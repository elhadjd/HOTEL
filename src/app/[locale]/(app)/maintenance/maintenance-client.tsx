"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  title: string;
  status: string;
  priority: string;
  blocksRoom: boolean;
  room: { code: string; maintenanceStatus: string } | null;
  hotel: { name: string };
};

export function MaintenanceClient({ initialRequests }: { initialRequests: Row[] }) {
  const [rows, setRows] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/v1/maintenance");
      const data = await res.json();
      if (res.ok) setRows(data.requests ?? []);
    });
  }

  function setStatus(id: string, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/maintenance/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink-900">Manutenção</h1>
        <p className="mt-1 text-sm text-stone-600">
          Pedidos, bloqueio de quarto e resolução — sem desalojar estadias activas automaticamente.
        </p>
      </div>
      {error ? <p className="text-sm text-terracotta-700">{error}</p> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-ink-900">{r.title}</p>
              <p className="text-xs text-stone-500">
                {r.hotel.name}
                {r.room ? ` · Quarto ${r.room.code} (${r.room.maintenanceStatus})` : ""} · {r.status}
                {r.blocksRoom ? " · bloqueia atribuição" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setStatus(r.id, "IN_PROGRESS")}>
                Em progresso
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={() => setStatus(r.id, "RESOLVED")}>
                Resolver
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-sm text-stone-500">Sem pedidos abertos.</li> : null}
      </ul>
    </div>
  );
}
