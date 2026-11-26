"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Building2, Edit3, Plus, Search, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";

type Customer = {
  id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  country_id?: number | null;
  country?: { id: number; name?: string | null; code?: string | null } | null;
  customer_type?: string | null;
  customer_code?: string | null;
  reference?: string | null;
  credit_limit?: number | null;
  account_balance?: number | null;
  birth_date?: string | null;
  sex?: string | null;
  status?: boolean;
  guestId?: string | null;
  associationStatus?: "linked" | "available";
};

type ConversionResult = {
  centralCustomerId: string;
  outcome: string;
  guestId?: string;
  message?: string;
};

type CustomerFormState = {
  customer_type: "individual" | "company";
  name: string;
  surname: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  country_id: string;
  birth_date: string;
  sex: string;
  customer_code: string;
  reference: string;
  credit_limit: string;
  sponsor_code: string;
  status: boolean;
};

function emptyCustomerForm(): CustomerFormState {
  return {
    customer_type: "individual",
    name: "",
    surname: "",
    nif: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    country_id: "",
    birth_date: "",
    sex: "",
    customer_code: "",
    reference: "",
    credit_limit: "",
    sponsor_code: "",
    status: true,
  };
}

function customerToForm(c: Customer): CustomerFormState {
  return {
    customer_type: c.customer_type === "company" ? "company" : "individual",
    name: c.name ?? "",
    surname: c.surname ?? "",
    nif: c.nif ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    province: c.province ?? "",
    country_id: c.country_id ? String(c.country_id) : "",
    birth_date: c.birth_date ? c.birth_date.slice(0, 10) : "",
    sex: c.sex ?? "",
    customer_code: c.customer_code ?? "",
    reference: c.reference ?? "",
    credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
    sponsor_code: "",
    status: c.status !== false,
  };
}

function buildCustomerPayload(form: CustomerFormState) {
  const isCompany = form.customer_type === "company";
  const countryNum = form.country_id.trim() ? Number(form.country_id) : null;
  const creditNum = form.credit_limit.trim() ? Number(form.credit_limit) : null;

  return {
    customer_type: form.customer_type,
    name: form.name.trim(),
    surname: isCompany ? null : form.surname.trim() || null,
    nif: form.nif.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    province: form.province.trim() || null,
    country_id: countryNum && Number.isFinite(countryNum) && countryNum > 0 ? countryNum : null,
    birth_date: isCompany ? null : form.birth_date.trim() || null,
    sex: isCompany ? null : form.sex.trim() || null,
    customer_code: form.customer_code.trim() || null,
    reference: form.reference.trim() || null,
    credit_limit: creditNum !== null && Number.isFinite(creditNum) && creditNum >= 0 ? creditNum : null,
    sponsor_code: form.sponsor_code.trim() || null,
    status: form.status,
  };
}

export function CustomersClient({
  initial,
  pagination,
  associations,
}: {
  initial: Customer[];
  pagination?: { current_page?: number; per_page?: number; total?: number; last_page?: number };
  associations: Record<string, string>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(pagination?.current_page ?? 1);
  const [rows, setRows] = useState(
    initial.map((c) => ({
      ...c,
      guestId: associations[String(c.id)] ?? null,
      associationStatus: associations[String(c.id)] ? ("linked" as const) : ("available" as const),
    })),
  );
  const [meta, setMeta] = useState(pagination);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<ConversionResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Independent FormDrawer state
  const [drawerMode, setDrawerMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const selectedCount = selected.size;
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);

  function loadPage(nextPage: number, query = q) {
    setError(null);
    startTransition(async () => {
      const params = new URLSearchParams({
        page: String(nextPage),
        per_page: "25",
      });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/v1/integrations/sigesc/customers?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao pesquisar clientes");
        return;
      }
      const next = (data.data ?? []) as Customer[];
      setRows(
        next.map((c) => ({
          ...c,
          guestId: associations[String(c.id)] ?? null,
          associationStatus: associations[String(c.id)]
            ? ("linked" as const)
            : ("available" as const),
        })),
      );
      setMeta(data.meta?.pagination);
      setPage(data.meta?.pagination?.current_page ?? nextPage);
      setSelected(new Set());
    });
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    loadPage(1, q);
  }

  function openCreate() {
    setError(null);
    setInfo(null);
    setEditingId(null);
    setForm(emptyCustomerForm());
    setDrawerMode("create");
  }

  function openEdit(c: Customer) {
    setError(null);
    setInfo(null);
    setEditingId(c.id);
    setForm(customerToForm(c));
    setDrawerMode("edit");

    // Fetch full detailed central record (birth_date, sex, credit_limit, etc.)
    setLoadingDetail(true);
    fetch(`/api/v1/integrations/sigesc/customers/${c.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.customer) {
          setForm(customerToForm(data.customer as Customer));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }

  function submitDrawer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const payload = buildCustomerPayload(form);

    startTransition(async () => {
      if (drawerMode === "create") {
        const res = await fetch("/api/v1/integrations/sigesc/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao criar cliente no sistema central");
          return;
        }
        setRows((prev) => [
          { ...data.customer, associationStatus: "available" as const, guestId: null },
          ...prev,
        ]);
        setDrawerMode("closed");
        setInfo(`Cliente #${data.customer?.id} criado no sistema central.`);
        router.refresh();
        return;
      }

      if (drawerMode === "edit" && editingId != null) {
        const res = await fetch(`/api/v1/integrations/sigesc/customers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao actualizar cliente no sistema central");
          return;
        }
        const updated = (data.customer ?? {}) as Customer;
        setRows((prev) =>
          prev.map((r) =>
            r.id === editingId
              ? {
                  ...r,
                  ...updated,
                  guestId: r.guestId,
                  associationStatus: r.associationStatus,
                }
              : r,
          ),
        );
        setDrawerMode("closed");
        setEditingId(null);
        setInfo(`Cliente #${editingId} actualizado no sistema central.`);
        router.refresh();
      }
    });
  }

  function convertOne(id: number) {
    setError(null);
    setInfo(null);
    setBulkResults(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/customers/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centralCustomerId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao converter em hóspede");
        return;
      }
      const result = data.result as ConversionResult;
      if (result.outcome === "converted" || result.outcome === "already_associated") {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  associationStatus: "linked",
                  guestId: result.guestId ?? r.guestId,
                }
              : r,
          ),
        );
        setInfo(
          result.outcome === "converted"
            ? `Hóspede criado (${result.guestId})`
            : `Já associado ao hóspede ${result.guestId}`,
        );
      } else {
        setError(result.message ?? result.outcome);
      }
      router.refresh();
    });
  }

  function toggleAllPage() {
    const allSelected = pageIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pageIds));
    }
  }

  function confirmBulk() {
    if (selectedCount === 0) return;
    if (
      !window.confirm(
        `Converter ${selectedCount} cliente(s) seleccionado(s) em hóspedes operacionais?`,
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/customers/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centralCustomerIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha na conversão em lote");
        return;
      }
      const results = data.results as ConversionResult[];
      setBulkResults(results);
      setRows((prev) =>
        prev.map((r) => {
          const hit = results.find((x) => x.centralCustomerId === String(r.id));
          if (
            hit &&
            (hit.outcome === "converted" || hit.outcome === "already_associated") &&
            hit.guestId
          ) {
            return { ...r, associationStatus: "linked", guestId: hit.guestId };
          }
          return r;
        }),
      );
      setSelected(new Set());
      setInfo(
        `Lote: ${data.summary?.converted ?? 0} convertidos · ${data.summary?.already_associated ?? 0} já associados · ${data.summary?.failed ?? 0} falhas`,
      );
      router.refresh();
    });
  }

  const currentPage = meta?.current_page ?? page;
  const lastPage = meta?.last_page ?? 1;

  return (
    <div className="space-y-5">
      {/* Independent Header Toolbar */}
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Clientes do Sistema Central</h2>
            <p className="font-ui mt-0.5 text-sm text-stone-500">
              Registos financeiros sincronizados com o sistema central. Converta em hóspede ou edite
              todos os dados fiscais e comerciais.
            </p>
          </div>
          <Button type="button" onClick={openCreate} disabled={pending} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo cliente central
          </Button>
        </div>

        <form onSubmit={search} className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full flex-1 sm:min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar nome, email, telefone, NIF ou código…"
              className="font-ui h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Pesquisar
          </Button>
        </form>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3">
          <span className="font-ui text-sm font-medium text-teal-900">
            {selectedCount} cliente(s) seleccionado(s)
          </span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={confirmBulk} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Converter em hóspedes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Limpar
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-lg border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {info}
        </div>
      ) : null}

      {bulkResults ? (
        <div className="surface max-h-44 overflow-auto p-4 text-xs">
          <p className="mb-2 font-semibold text-ink-900">Resultado da conversão em lote</p>
          <ul className="space-y-1">
            {bulkResults.map((r) => (
              <li key={`${r.centralCustomerId}-${r.outcome}`}>
                #{r.centralCustomerId}: {r.outcome}
                {r.guestId ? (
                  <>
                    {" "}
                    →{" "}
                    <a className="text-teal-700 underline" href={`/guests/${r.guestId}`}>
                      abrir hóspede
                    </a>
                  </>
                ) : null}
                {r.message ? ` (${r.message})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Full-width Responsive List */}
      <div className="surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="font-ui p-8 text-center text-sm text-stone-500">
            Sem clientes nesta página.
          </p>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-sand-100 md:hidden">
              {rows.map((c) => {
                const displayName = c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim();
                const isCompany = c.customer_type === "company";
                return (
                  <div key={c.id} className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                        className="mt-1 h-4 w-4 accent-teal-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-medium text-ink-900">{displayName}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                            {isCompany ? (
                              <Building2 className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            {isCompany ? "Empresa" : "Individual"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          #{c.id}
                          {c.nif ? ` · NIF ${c.nif}` : ""}
                          {c.customer_code ? ` · ${c.customer_code}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-600">
                          {[c.email, c.phone, c.city, c.province].filter(Boolean).join(" · ") ||
                            "Sem contactos"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-2.5">
                      <span className="text-xs font-medium text-stone-600">
                        {c.associationStatus === "linked" ? (
                          <a className="text-teal-700 underline" href={`/guests/${c.guestId}`}>
                            Hóspede ligado
                          </a>
                        ) : (
                          "Sem hóspede"
                        )}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => openEdit(c)}
                          className="gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        {c.associationStatus === "linked" ? (
                          <a
                            className="inline-flex h-8 items-center rounded-md border border-teal-200 bg-teal-50 px-3 text-xs font-medium text-teal-800"
                            href={`/guests/${c.guestId}`}
                          >
                            Abrir hóspede
                          </a>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => convertOne(c.id)}
                          >
                            Converter
                          </Button>
                        )}
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
                    <th className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar página"
                        checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))}
                        onChange={toggleAllPage}
                        className="h-4 w-4 accent-teal-600"
                      />
                    </th>
                    <th>Cliente</th>
                    <th>Fiscalidade & Tipo</th>
                    <th>Contactos & Localização</th>
                    <th>Ligação Hotel</th>
                    <th className="text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const displayName = c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim();
                    const isCompany = c.customer_type === "company";
                    return (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-teal-600"
                          />
                        </td>
                        <td>
                          <div className="font-medium text-ink-900">{displayName}</div>
                          <div className="font-mono text-xs text-stone-400">
                            #{c.id}
                            {c.customer_code ? ` · ${c.customer_code}` : ""}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                              {isCompany ? (
                                <Building2 className="h-3 w-3" />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              {isCompany ? "Empresa" : "Individual"}
                            </span>
                            {c.status === false ? (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-danger">
                                Inactivo
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 font-mono text-xs text-stone-500">
                            {c.nif ? `NIF: ${c.nif}` : "Sem NIF"}
                          </div>
                        </td>
                        <td>
                          <div className="text-xs text-ink-900">
                            {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-stone-500">
                            {[c.city, c.province, c.country?.name].filter(Boolean).join(", ") ||
                              c.address ||
                              "—"}
                          </div>
                        </td>
                        <td className="text-sm text-stone-600">
                          {c.associationStatus === "linked" ? (
                            <a className="font-medium text-teal-700 hover:underline" href={`/guests/${c.guestId}`}>
                              Hóspede ligado
                            </a>
                          ) : (
                            <span className="text-xs text-stone-400">Sem hóspede</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              onClick={() => openEdit(c)}
                              className="gap-1"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            {c.associationStatus === "linked" ? (
                              <a
                                className="text-xs font-medium text-teal-700 hover:underline"
                                href={`/guests/${c.guestId}`}
                              >
                                Abrir
                              </a>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={() => convertOne(c.id)}
                              >
                                Converter
                              </Button>
                            )}
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

      {meta ? (
        <div className="font-ui flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span>
            Página {currentPage} de {lastPage} · {meta.total ?? rows.length} total
          </span>
          {lastPage > 1 ? (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || currentPage <= 1}
                onClick={() => loadPage(currentPage - 1)}
              >
                ← Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || currentPage >= lastPage}
                onClick={() => loadPage(currentPage + 1)}
              >
                Próxima →
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Full Central Customer Create / Edit Portal Drawer */}
      <FormDrawer
        open={drawerMode !== "closed"}
        onClose={() => {
          setDrawerMode("closed");
          setEditingId(null);
        }}
        eyebrow="Sistema Central · Clientes"
        title={drawerMode === "create" ? "Novo cliente central" : `Editar cliente #${editingId}`}
        subtitle="Todos os campos aceites pelo sistema central — os botões de acção ficam sempre fixos no rodapé."
        size="lg"
        onSubmit={submitDrawer}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked }))}
                className="h-4 w-4 accent-teal-600"
              />
              Cliente activo no sistema central
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDrawerMode("closed");
                  setEditingId(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || loadingDetail}>
                {pending
                  ? "A guardar…"
                  : drawerMode === "create"
                    ? "Criar no sistema central"
                    : "Guardar alterações"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 text-sm">
          {loadingDetail ? (
            <p className="rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-800">
              A carregar detalhes completos do cliente no sistema central…
            </p>
          ) : null}

          {/* Section 1: Identification & Tax */}
          <section className="surface space-y-4 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
              1. Identificação e Fiscalidade
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-stone-600">Tipo de cliente *</span>
                <select
                  value={form.customer_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      customer_type: e.target.value as "individual" | "company",
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                >
                  <option value="individual">Pessoa Singular (Individual)</option>
                  <option value="company">Pessoa Colectiva (Empresa / Organização)</option>
                </select>
              </label>

              <label className={`block ${form.customer_type === "company" ? "sm:col-span-2" : ""}`}>
                <span className="text-stone-600">
                  {form.customer_type === "company" ? "Razão Social / Nome da Empresa *" : "Nome *"}
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={form.customer_type === "company" ? "Ex.: Sonangol EP" : "Ex.: João"}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>

              {form.customer_type === "individual" ? (
                <label className="block">
                  <span className="text-stone-600">Apelido</span>
                  <input
                    value={form.surname}
                    onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
                    placeholder="Ex.: Silva"
                    className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="text-stone-600">NIF / N.º Contribuinte</span>
                <input
                  value={form.nif}
                  onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                  placeholder="Ex.: 5401234567"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>

              <label className="block">
                <span className="text-stone-600">Código de cliente</span>
                <input
                  value={form.customer_code}
                  onChange={(e) => setForm((f) => ({ ...f, customer_code: e.target.value }))}
                  placeholder="Opcional (gerado se vazio)"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>

              {form.customer_type === "individual" ? (
                <>
                  <label className="block">
                    <span className="text-stone-600">Data de nascimento</span>
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-stone-600">Género</span>
                    <select
                      value={form.sex}
                      onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                    >
                      <option value="">Não especificado</option>
                      <option value="male">Masculino</option>
                      <option value="female">Feminino</option>
                      <option value="other">Outro</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </section>

          {/* Section 2: Contacts & Address */}
          <section className="surface space-y-4 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
              2. Contactos e Endereço
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="cliente@dominio.ao"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Telefone</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+244 9XX XXX XXX"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-stone-600">Morada / Endereço completo</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Rua, Bairro, Edifício, N.º"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Cidade / Município</span>
                <input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Ex.: Luanda"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Província / Estado</span>
                <input
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                  placeholder="Ex.: Luanda"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
            </div>
          </section>

          {/* Section 3: Commercial & Credit */}
          <section className="surface space-y-4 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
              3. Dados Comerciais e Crédito
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Limite de crédito (AOA)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.credit_limit}
                  onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Referência interna</span>
                <input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Código de patrocinador / indicação</span>
                <input
                  value={form.sponsor_code}
                  onChange={(e) => setForm((f) => ({ ...f, sponsor_code: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">ID do País (central)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.country_id}
                  onChange={(e) => setForm((f) => ({ ...f, country_id: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
            </div>
          </section>
        </div>
      </FormDrawer>
    </div>
  );
}
