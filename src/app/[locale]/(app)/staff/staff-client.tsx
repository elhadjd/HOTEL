"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Membership = {
  id: string;
  status: string;
  user: {
    id: string;
    name: string;
    email: string;
    active: boolean;
    isInstitutionAdmin: boolean;
    lastLoginAt: string | null;
  };
  role: { id: string; code: string; name: string };
};

export function StaffClient({
  initialMemberships,
  roles,
}: {
  initialMemberships: Membership[];
  roles: SearchableOption[];
}) {
  const [rows, setRows] = useState(initialMemberships);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  function refresh() {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/v1/staff?${params}`);
      const data = await res.json();
      if (res.ok) setRows(JSON.parse(JSON.stringify(data.memberships ?? [])));
    });
  }

  function act(membershipId: string, body: object) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/staff/${membershipId}`, {
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
      <div>
        <h1 className="text-3xl font-semibold text-ink-900">Equipa</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
          Membros da instituição e papéis RBAC. Utilizadores sincronizados via Aggregate mantêm
          o papel atribuído localmente — nunca se promove admin automaticamente.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar nome / email…"
          className="h-10 w-64 rounded-md border border-sand-200 px-3 text-sm"
        />
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={refresh}>
          Filtrar
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Sem membros" description="Nenhuma membership encontrada." />
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {m.user.name}
                    {m.user.isInstitutionAdmin ? " · admin institucional" : ""}
                  </p>
                  <p className="font-ui text-xs text-stone-500">{m.user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusPill value={m.status} />
                    <StatusPill value={m.role.code} />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <SearchableSelect
                    className="w-48"
                    options={roles}
                    value={roleDraft[m.id] ?? m.role.code}
                    onChange={(v) => setRoleDraft((d) => ({ ...d, [m.id]: v }))}
                    clearable={false}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      act(m.id, {
                        action: "setRole",
                        roleCode: roleDraft[m.id] ?? m.role.code,
                      })
                    }
                  >
                    Guardar papel
                  </Button>
                  {m.status === "ACTIVE" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (confirm("Suspender este membro?")) {
                          act(m.id, { action: "setStatus", status: "SUSPENDED" });
                        }
                      }}
                    >
                      Suspender
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => act(m.id, { action: "setStatus", status: "ACTIVE" })}
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
