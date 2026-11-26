"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  blocksRoom: boolean;
  resolution: string | null;
  createdAt: string;
  room: { id: string; code: string; maintenanceStatus: string; occupancyStatus: string } | null;
  hotel: { id: string; name: string };
};

export function MaintenanceOpsClient({
  initialRequests,
  hotels,
  focusRequestId,
}: {
  initialRequests: RequestRow[];
  hotels: SearchableOption[];
  focusRequestId?: string;
}) {
  const [rows, setRows] = useState(initialRequests);
  const [hotelId, setHotelId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (hotelId ? rows.filter((r) => r.hotel.id === hotelId) : rows),
    [rows, hotelId],
  );

  function refresh() {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (hotelId) params.set("hotelId", hotelId);
      const res = await fetch(`/api/v1/maintenance?${params}`);
      const data = await res.json();
      if (res.ok) setRows(JSON.parse(JSON.stringify(data.requests ?? [])));
    });
  }

  function setStatus(requestId: string, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/maintenance/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          assignedTo: assignee || undefined,
          resolution: resolution || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha");
        return;
      }
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">Manutenção</h1>
          <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
            Pedidos bloqueantes impedem alocação. Resolver manutenção não marca o quarto como CLEAN
            — a governança continua a aplicar-se. Estadias activas não são desalojadas.
          </p>
        </div>
        <SearchableSelect
          className="w-full sm:w-56"
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={setHotelId}
          clearable={false}
        />
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}

      <div className="surface grid gap-3 p-4 sm:grid-cols-2">
        <label className="font-ui block text-xs text-stone-500">
          Atribuir / técnico
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
          />
        </label>
        <label className="font-ui block text-xs text-stone-500">
          Notas de resolução
          <input
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sem pedidos" description="Nenhum pedido de manutenção activo." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li
              key={r.id}
              id={`maint-${r.id}`}
              className={`surface p-4 ${focusRequestId === r.id ? "ring-2 ring-teal-500" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {r.title}
                    {r.room ? ` · ${r.room.code}` : ""}
                  </p>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {r.hotel.name} · {r.priority}
                    {r.assignedTo ? ` · ${r.assignedTo}` : ""}
                    {r.blocksRoom ? " · BLOQUEIA QUARTO" : ""}
                  </p>
                  {r.description ? (
                    <p className="font-ui mt-2 text-sm text-stone-600">{r.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusPill value={r.status} />
                    {r.room ? <StatusPill value={r.room.maintenanceStatus} /> : null}
                    {r.room ? <StatusPill value={r.room.occupancyStatus} /> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setStatus(r.id, "ASSIGNED")}
                  >
                    Atribuir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setStatus(r.id, "IN_PROGRESS")}
                  >
                    Em curso
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setStatus(r.id, "WAITING_PARTS")}
                  >
                    Aguardar peças
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !resolution.trim()}
                    onClick={() => setStatus(r.id, "RESOLVED")}
                  >
                    Resolver
                  </Button>
                  {["RESOLVED", "CANCELLED"].includes(r.status) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        startTransition(async () => {
                          const res = await fetch(`/api/v1/maintenance/${r.id}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "reopen" }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setError(data.error ?? "Falha");
                            return;
                          }
                          refresh();
                        });
                      }}
                    >
                      Reabrir
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
