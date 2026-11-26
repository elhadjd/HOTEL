"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sliders,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PERMISSIONS,
  PERMISSION_MODULE_LABELS,
} from "@/modules/iam/permissions";

type OverrideItem = {
  code: string;
  effect: "GRANT" | "DENY";
};

type MembershipRow = {
  id: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  aggregateSuggestedLevel: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    active: boolean;
    isInstitutionAdmin: boolean;
    lastLoginAt: string | null;
    invitePending: boolean;
  };
  role: { id: string; code: string; name: string };
  rolePermissions: string[];
  overrides: OverrideItem[];
  effectivePermissions: string[];
};

type RoleOption = {
  id: string;
  code: string;
  name: string;
  permissions: string[];
};

const PERMISSION_MODULES = (() => {
  const byModule = new Map<string, Array<(typeof PERMISSIONS)[number]>>();
  for (const p of PERMISSIONS) {
    const list = byModule.get(p.module) ?? [];
    list.push(p);
    byModule.set(p.module, list);
  }
  return [...byModule.entries()].map(([moduleKey, items]) => ({
    key: moduleKey,
    label: PERMISSION_MODULE_LABELS[moduleKey] ?? moduleKey,
    items,
  }));
})();

export function StaffClient({
  initialMemberships,
  roles,
  canWrite,
  callerPermissions,
  currentUserId,
}: {
  initialMemberships: MembershipRow[];
  roles: RoleOption[];
  canWrite: boolean;
  callerPermissions: string[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Permission drawer state
  const [editingMember, setEditingMember] = useState<MembershipRow | null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [permSearch, setPermSearch] = useState("");

  // Create user drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoleCode, setNewRoleCode] = useState(
    roles.find((r) => r.code === "receptionist")?.code ?? roles[0]?.code ?? "user",
  );
  const [newMustChange, setNewMustChange] = useState(true);

  const callerPermSet = useMemo(() => new Set(callerPermissions), [callerPermissions]);
  const roleOptions = useMemo(
    () =>
      roles.map((r) => ({
        value: r.code,
        label: r.name,
        description: `${r.permissions.length} permissões base`,
        keywords: [r.code, r.name],
      })),
    [roles],
  );

  const stats = useMemo(() => {
    const active = memberships.filter((m) => m.status === "ACTIVE").length;
    const suspended = memberships.filter((m) => m.status === "SUSPENDED").length;
    const customized = memberships.filter((m) => m.overrides.length > 0).length;
    return { total: memberships.length, active, suspended, customized };
  }, [memberships]);

  async function reload(nextQ = q, nextStatus = statusFilter) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextStatus) params.set("status", nextStatus);
    const res = await fetch(`/api/v1/staff?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Falha ao carregar utilizadores");
      return;
    }
    setMemberships(data.memberships ?? []);
  }

  function changeRole(membershipId: string, roleCode: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/staff/${membershipId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao alterar perfil");
        return;
      }
      setMessage("Perfil base actualizado com sucesso.");
      await reload();
      router.refresh();
    });
  }

  function toggleStatus(m: MembershipRow) {
    setError(null);
    setMessage(null);
    const next = m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    startTransition(async () => {
      const res = await fetch(`/api/v1/staff/${m.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao alterar estado");
        return;
      }
      setMessage(
        next === "ACTIVE"
          ? `Utilizador ${m.user.name} reactivado.`
          : `Utilizador ${m.user.name} suspenso e sessão revogada.`,
      );
      await reload();
      router.refresh();
    });
  }

  function openPermissionsDrawer(m: MembershipRow) {
    setError(null);
    setMessage(null);
    setPermSearch("");
    setEditingMember(m);
    setDraftPerms(new Set(m.effectivePermissions));
  }

  function togglePerm(code: string) {
    if (!callerPermSet.has(code)) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function setModulePerms(codes: string[], enable: boolean) {
    setDraftPerms((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (!callerPermSet.has(code)) continue;
        if (enable) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  function savePermissions() {
    if (!editingMember) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/staff/${editingMember.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...draftPerms] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao guardar permissões");
        return;
      }
      setMessage(
        `Permissões de ${editingMember.user.name} guardadas (${data.effectivePermissions?.length ?? draftPerms.size} activas) e aplicadas imediatamente.`,
      );
      setEditingMember(null);
      await reload();
      router.refresh();
    });
  }

  function resetToRoleDefaults() {
    if (!editingMember) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/staff/${editingMember.id}/permissions`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao repor permissões");
        return;
      }
      setDraftPerms(new Set(data.effectivePermissions ?? editingMember.rolePermissions));
      setMessage(`Permissões de ${editingMember.user.name} repostas para o padrão do perfil.`);
      await reload();
      router.refresh();
    });
  }

  function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          roleCode: newRoleCode,
          mustChangePassword: newMustChange,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar utilizador");
        return;
      }
      setMessage(`Utilizador "${newName.trim()}" criado com sucesso.`);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setCreateOpen(false);
      await reload();
      router.refresh();
    });
  }

  const filteredModules = useMemo(() => {
    const query = permSearch.trim().toLowerCase();
    if (!query) return PERMISSION_MODULES;
    return PERMISSION_MODULES.map((mod) => ({
      ...mod,
      items: mod.items.filter(
        (p) =>
          p.label.toLowerCase().includes(query) ||
          p.code.toLowerCase().includes(query) ||
          mod.label.toLowerCase().includes(query),
      ),
    })).filter((mod) => mod.items.length > 0);
  }, [permSearch]);

  const roleBaselineSet = useMemo(
    () => new Set(editingMember?.rolePermissions ?? []),
    [editingMember],
  );

  return (
    <div className="space-y-6">
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

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Total na equipa
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{stats.total}</p>
        </div>
        <div className="surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Utilizadores activos
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
            {stats.active}
          </p>
        </div>
        <div className="surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Permissões personalizadas
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-teal-700">
            {stats.customized}
          </p>
        </div>
        <div className="surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Suspensos
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-500">
            {stats.suspended}
          </p>
        </div>
      </div>

      {/* Filters & create button */}
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startTransition(() => void reload());
              }}
              placeholder="Pesquisar utilizador por nome ou email…"
              className="h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              startTransition(() => void reload(q, e.target.value));
            }}
            className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
          >
            <option value="">Todos os estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INVITED">Convidados</option>
            <option value="SUSPENDED">Suspensos</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => void reload())}
          >
            Filtrar
          </Button>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo utilizador
          </Button>
        ) : null}
      </div>

      {/* Staff list */}
      {memberships.length === 0 ? (
        <EmptyState title="Sem utilizadores" description="Nenhum membro corresponde ao filtro." />
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => {
            const grants = m.overrides.filter((o) => o.effect === "GRANT").length;
            const denies = m.overrides.filter((o) => o.effect === "DENY").length;
            const isSelf = m.user.id === currentUserId;
            return (
              <div
                key={m.id}
                className="surface flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white">
                      {m.user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink-900">{m.user.name}</p>
                        {isSelf ? (
                          <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                            Você
                          </span>
                        ) : null}
                        <StatusPill value={m.status} />
                      </div>
                      <p className="truncate text-sm text-stone-500">{m.user.email}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 font-medium text-teal-900">
                      <Shield className="h-3.5 w-3.5 text-teal-600" />
                      {m.effectivePermissions.length} / {PERMISSIONS.length} permissões activas
                    </span>
                    {grants > 0 ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                        +{grants} extra
                      </span>
                    ) : null}
                    {denies > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-danger">
                        -{denies} bloqueadas
                      </span>
                    ) : null}
                    {grants === 0 && denies === 0 ? (
                      <span className="text-stone-400">Padrão do perfil {m.role.name}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canWrite ? (
                    <>
                      <div className="w-56">
                        <SearchableSelect
                          options={roleOptions}
                          value={m.role.code}
                          onChange={(v) => v && changeRole(m.id, v)}
                          clearable={false}
                          disabled={pending || isSelf}
                          labels={{ placeholder: "Perfil base", searchPlaceholder: "Perfil…" }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openPermissionsDrawer(m)}
                        className="gap-1.5"
                      >
                        <Sliders className="h-4 w-4" />
                        Permissões
                      </Button>
                      <Button
                        type="button"
                        variant={m.status === "ACTIVE" ? "ghost" : "secondary"}
                        disabled={pending || isSelf}
                        onClick={() => toggleStatus(m)}
                        className={m.status === "ACTIVE" ? "text-danger hover:bg-red-50" : undefined}
                      >
                        {m.status === "ACTIVE" ? "Suspender" : "Reactivar"}
                      </Button>
                    </>
                  ) : (
                    <span className="rounded-md bg-sand-100 px-3 py-1.5 text-xs font-medium text-stone-700">
                      {m.role.name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Granular Permissions Matrix Drawer */}
      {editingMember ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink-950/45">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
            onClick={() => setEditingMember(null)}
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col bg-sand-50 shadow-2xl animate-fade-up">
            <div className="flex items-start justify-between border-b border-sand-200 bg-white px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">
                  Matriz de Permissões Granulares
                </p>
                <h3 className="mt-0.5 text-xl font-semibold text-ink-900">
                  {editingMember.user.name}
                </h3>
                <p className="text-xs text-stone-500">
                  {editingMember.user.email} · Perfil base:{" "}
                  <strong>{editingMember.role.name}</strong> ·{" "}
                  <strong>
                    {draftPerms.size}/{PERMISSIONS.length}
                  </strong>{" "}
                  activas
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditingMember(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-b border-sand-200 bg-sand-50 px-6 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder="Filtrar módulos ou permissões (ex.: faturas, reservas, check-in…)"
                    className="h-9 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={resetToRoleDefaults}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Repor padrão do perfil
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {filteredModules.map((mod) => {
                const modCodes = mod.items.map((p) => p.code);
                const enabledCount = modCodes.filter((c) => draftPerms.has(c)).length;
                const allEnabled = enabledCount === modCodes.length;
                return (
                  <section key={mod.key} className="surface overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 bg-sand-50/70 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-ink-900">{mod.label}</h4>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-stone-600 ring-1 ring-sand-200">
                          {enabledCount}/{modCodes.length}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setModulePerms(modCodes, !allEnabled)}
                          className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                        >
                          {allEnabled ? "Desactivar módulo" : "Activar módulo"}
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-sand-100">
                      {mod.items.map((perm) => {
                        const checked = draftPerms.has(perm.code);
                        const inRole = roleBaselineSet.has(perm.code);
                        const callerHas = callerPermSet.has(perm.code);
                        const isExtraGrant = checked && !inRole;
                        const isExplicitDeny = !checked && inRole;
                        return (
                          <label
                            key={perm.code}
                            className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                              callerHas ? "cursor-pointer hover:bg-sand-50/70" : "opacity-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-900">{perm.label}</span>
                                {isExtraGrant ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                    <ShieldCheck className="h-3 w-3" />
                                    Extra concedida
                                  </span>
                                ) : isExplicitDeny ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-danger">
                                    <ShieldOff className="h-3 w-3" />
                                    Bloqueada
                                  </span>
                                ) : inRole ? (
                                  <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                                    Herdada
                                  </span>
                                ) : null}
                              </div>
                              <p className="font-mono text-[11px] text-stone-400">{perm.code}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!callerHas || pending}
                              onChange={() => togglePerm(perm.code)}
                              className="h-4 w-4 shrink-0 rounded accent-teal-600"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-sand-200 bg-white px-6 py-4">
              <p className="text-xs text-stone-500">
                Alterações são auditadas e respeitadas em todas as páginas e acções.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingMember(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={savePermissions}
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  {pending ? "A guardar…" : "Guardar permissões"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create Staff User Drawer */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink-950/45">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-sand-50 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-sand-200 bg-white px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Equipa do Hotel
                </p>
                <h3 className="text-xl font-semibold text-ink-900">Novo utilizador</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCreateOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={createUser} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
                <label className="block">
                  <span className="text-stone-600">Nome completo *</span>
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex.: Ana Paula Ferreira"
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  />
                </label>
                <label className="block">
                  <span className="text-stone-600">Email de acesso *</span>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="ana@hotel.ao"
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  />
                </label>
                <label className="block">
                  <span className="text-stone-600">Palavra-passe inicial (mín. 8 caracteres) *</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  />
                </label>
                <div className="block">
                  <span className="text-stone-600">Perfil base *</span>
                  <SearchableSelect
                    className="mt-1"
                    options={roleOptions}
                    value={newRoleCode}
                    onChange={setNewRoleCode}
                    clearable={false}
                    labels={{ placeholder: "Escolher perfil", searchPlaceholder: "Perfil…" }}
                  />
                </div>
                <label className="flex items-center gap-2 pt-1 text-ink-900">
                  <input
                    type="checkbox"
                    checked={newMustChange}
                    onChange={(e) => setNewMustChange(e.target.checked)}
                    className="h-4 w-4 accent-teal-600"
                  />
                  Exigir definição de nova palavra-passe no primeiro acesso
                </label>
                <p className="rounded-md bg-white p-3 text-xs text-stone-500 ring-1 ring-sand-200">
                  Após criar o utilizador, clique em <strong>Permissões</strong> na linha dele para
                  personalizar cada módulo individualmente.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-sand-200 bg-white px-6 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "A criar…" : "Criar utilizador"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
