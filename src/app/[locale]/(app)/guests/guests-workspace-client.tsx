"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Crown, Edit3, FileText, Plus, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestFormDrawer, type GuestDTO } from "./guest-form-drawer";

type FilterTab = "all" | "vip" | "company" | "pending";

export function GuestsWorkspaceClient({
  initialGuests,
  initialQuery = "",
}: {
  initialGuests: GuestDTO[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<FilterTab>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestDTO | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialGuests.filter((g) => {
      if (tab === "vip" && (!g.vipTier || g.vipTier === "STANDARD")) return false;
      if (tab === "company" && g.customerType !== "company" && !g.companyName) return false;
      if (tab === "pending" && g.customerMapping?.syncStatus === "LINKED") return false;
      if (!q) return true;
      const haystack = [
        g.firstName,
        g.lastName,
        g.companyName,
        g.nif,
        g.email,
        g.phone,
        g.city,
        g.nationality,
        g.documents?.[0]?.reference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initialGuests, query, tab]);

  const counts = useMemo(
    () => ({
      all: initialGuests.length,
      vip: initialGuests.filter((g) => g.vipTier && g.vipTier !== "STANDARD").length,
      company: initialGuests.filter((g) => g.customerType === "company" || Boolean(g.companyName))
        .length,
      pending: initialGuests.filter((g) => g.customerMapping?.syncStatus !== "LINKED").length,
    }),
    [initialGuests],
  );

  function openCreate() {
    setEditingGuest(null);
    setDrawerOpen(true);
  }

  function openEdit(guest: GuestDTO) {
    setEditingGuest(guest);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Hóspedes & Perfis</h2>
            <p className="font-ui mt-0.5 text-sm text-stone-500">
              Fichas completas com identificação, documento de check-in, preferências VIP e ligação
              financeira ao sistema central.
            </p>
          </div>
          <Button type="button" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo hóspede
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar nome, NIF, documento, empresa, email, telefone…"
              className="font-ui h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
            />
          </div>

          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                { key: "all", label: `Todos (${counts.all})` },
                { key: "vip", label: `VIP (${counts.vip})` },
                { key: "company", label: `Corporativos (${counts.company})` },
                { key: "pending", label: `Pendentes (${counts.pending})` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  tab === t.key
                    ? "bg-ink-900 text-white"
                    : "bg-sand-100 text-stone-600 hover:bg-sand-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {info ? (
        <div className="rounded-lg border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {info}
        </div>
      ) : null}

      {/* Independent Full-Width Guest List */}
      <div className="surface overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="Sem hóspedes encontrados"
            description="Ajuste a pesquisa ou clique em 'Novo hóspede' para registar um perfil completo."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-sand-100 md:hidden">
              {filtered.map((guest) => {
                const doc = guest.documents?.[0];
                const linked = guest.customerMapping?.syncStatus === "LINKED";
                return (
                  <div key={guest.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/guests/${guest.id}`}
                          className="font-semibold text-teal-800 hover:underline"
                        >
                          {[guest.salutation, guest.firstName, guest.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </Link>
                        {guest.companyName ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-600">
                            <Building2 className="h-3 w-3" />
                            {guest.companyName}
                          </p>
                        ) : null}
                      </div>
                      {guest.vipTier && guest.vipTier !== "STANDARD" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          <Crown className="h-3 w-3" />
                          {guest.vipTier}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
                      <div>
                        <span className="text-stone-400">Contactos</span>
                        <p className="truncate font-medium text-ink-900">
                          {guest.phone || guest.email || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-stone-400">NIF / Doc.</span>
                        <p className="truncate font-mono text-ink-900">
                          {guest.nif || (doc ? `${doc.type} ${doc.reference}` : "—")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          linked
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {linked ? "Central ligado" : guest.customerMapping?.syncStatus ?? "Sem ligação"}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openEdit(guest)}
                          className="gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Link
                          href={`/guests/${guest.id}`}
                          className="inline-flex h-8 items-center rounded-md bg-ink-900 px-3 text-xs font-medium text-white"
                        >
                          Perfil
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hóspede</th>
                    <th>Documento & NIF</th>
                    <th>Contactos & Origem</th>
                    <th>Perfil</th>
                    <th>Sistema Central</th>
                    <th className="text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((guest) => {
                    const doc = guest.documents?.[0];
                    const linked = guest.customerMapping?.syncStatus === "LINKED";
                    return (
                      <tr key={guest.id}>
                        <td>
                          <Link
                            href={`/guests/${guest.id}`}
                            className="font-semibold text-teal-800 hover:underline"
                          >
                            {[guest.salutation, guest.firstName, guest.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                            {guest.customerType === "company" ? (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {guest.companyName || "Empresa"}
                              </span>
                            ) : guest.companyName ? (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {guest.companyName}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Individual
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="font-mono text-xs text-ink-900">
                            {guest.nif ? `NIF: ${guest.nif}` : "Sem NIF"}
                          </div>
                          {doc ? (
                            <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-stone-500">
                              <FileText className="h-3 w-3" />
                              {doc.type}: {doc.reference}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-xs text-stone-400">Sem documento</div>
                          )}
                        </td>
                        <td>
                          <div className="text-xs text-ink-900">
                            {[guest.phone, guest.email].filter(Boolean).join(" · ") || "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-stone-500">
                            {[guest.nationality, guest.city, guest.country]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </td>
                        <td>
                          {guest.vipTier && guest.vipTier !== "STANDARD" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                              <Crown className="h-3 w-3" />
                              {guest.vipTier}
                            </span>
                          ) : (
                            <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">
                              Standard
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                              linked
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {linked
                              ? `Ligado #${guest.customerMapping?.externalCustomerId}`
                              : guest.customerMapping?.syncStatus ?? "UNLINKED"}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => openEdit(guest)}
                              className="gap-1"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Link
                              href={`/guests/${guest.id}`}
                              className="text-xs font-semibold text-teal-700 hover:underline"
                            >
                              Abrir
                            </Link>
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

      {/* Independent Portal FormDrawer for Create & Edit Guest */}
      <GuestFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingGuest(null);
        }}
        editingGuest={editingGuest}
        onSaved={(msg) => setInfo(msg)}
      />
    </div>
  );
}
