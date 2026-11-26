"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

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
  customer_code?: string | null;
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

  // Create form state
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  // Edit form state
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNif, setEditNif] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editStatus, setEditStatus] = useState(true);

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
        setError(data.error ?? "Search failed");
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

  function startEdit(c: Customer) {
    setError(null);
    setInfo(null);
    setEditing(c);
    setEditName(c.name ?? "");
    setEditSurname(c.surname ?? "");
    setEditEmail(c.email ?? "");
    setEditPhone(c.phone ?? "");
    setEditNif(c.nif ?? "");
    setEditAddress(c.address ?? "");
    setEditCity(c.city ?? "");
    setEditStatus(c.status !== false);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/customers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          surname: editSurname.trim() || null,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          nif: editNif.trim() || null,
          address: editAddress.trim() || null,
          city: editCity.trim() || null,
          status: editStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar cliente no SIGESC");
        return;
      }
      const updated = (data.customer ?? {}) as Customer;
      setRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                ...updated,
                guestId: r.guestId,
                associationStatus: r.associationStatus,
              }
            : r,
        ),
      );
      setEditing(null);
      setInfo(`Cliente #${editing.id} actualizado no SIGESC.`);
      router.refresh();
    });
  }

  function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          surname,
          email: email || null,
          phone: phone || null,
          nif: nif || null,
          address: address || null,
          city: city || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Create failed");
        return;
      }
      setName("");
      setSurname("");
      setEmail("");
      setPhone("");
      setNif("");
      setAddress("");
      setCity("");
      setRows((prev) => [
        { ...data.customer, associationStatus: "available" as const, guestId: null },
        ...prev,
      ]);
      setInfo(`Cliente #${data.customer?.id} criado no SIGESC.`);
      router.refresh();
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
        setError(data.error ?? "Convert failed");
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
        setError(data.error ?? "Bulk convert failed");
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
    <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
      <div>
        <form onSubmit={search} className="mb-4 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, email, telefone, NIF, código…"
            className="font-ui h-10 min-w-[16rem] flex-1 rounded-md border border-sand-200 bg-white px-3 text-sm"
          />
          <Button type="submit" disabled={pending}>
            Pesquisar
          </Button>
        </form>

        {selectedCount > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2">
            <span className="font-ui text-sm text-teal-900">{selectedCount} seleccionado(s)</span>
            <Button type="button" size="sm" disabled={pending} onClick={confirmBulk}>
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
        ) : null}

        {error ? <p className="font-ui mb-3 text-sm text-red-700">{error}</p> : null}
        {info ? <p className="font-ui mb-3 text-sm text-teal-800">{info}</p> : null}

        {bulkResults ? (
          <div className="surface mb-4 max-h-40 overflow-auto p-3 text-xs">
            <p className="mb-2 font-medium">Resultado do lote</p>
            <ul className="space-y-1">
              {bulkResults.map((r) => (
                <li key={`${r.centralCustomerId}-${r.outcome}`}>
                  #{r.centralCustomerId}: {r.outcome}
                  {r.guestId ? (
                    <>
                      {" "}
                      →{" "}
                      <a className="text-teal-700 underline" href={`/guests/${r.guestId}`}>
                        hóspede
                      </a>
                    </>
                  ) : null}
                  {r.message ? ` (${r.message})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="surface overflow-hidden">
          {rows.length === 0 ? (
            <p className="font-ui p-6 text-sm text-stone-500">Sem clientes nesta página.</p>
          ) : (
            <table className="font-ui w-full text-left text-sm">
              <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar página"
                      checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))}
                      onChange={toggleAllPage}
                    />
                  </th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acções</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-sand-100">
                    <td className="px-3 py-3">
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
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">
                        {c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim()}
                      </div>
                      <div className="text-xs text-stone-500">
                        #{c.id} · {[c.email, c.phone, c.nif, c.city].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {c.associationStatus === "linked" ? (
                        <a className="text-teal-700 underline" href={`/guests/${c.guestId}`}>
                          Hóspede ligado
                        </a>
                      ) : (
                        "Sem hóspede"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => startEdit(c)}
                        >
                          Editar
                        </Button>
                        {c.associationStatus === "linked" ? (
                          <a className="text-sm text-teal-700 underline" href={`/guests/${c.guestId}`}>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
        {meta ? (
          <div className="font-ui mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <span>
              Página {currentPage} de {lastPage} · {meta.total ?? rows.length} total · select-all
              aplica-se só à página actual
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
      </div>

      <div className="space-y-6">
        {editing ? (
          <form onSubmit={saveEdit} className="surface border-l-4 border-l-teal-600 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-ink-900">
                Editar cliente #{editing.id}
              </h3>
              <button
                type="button"
                className="font-ui text-xs text-stone-500 underline"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </div>
            <p className="font-ui mt-1 text-xs text-stone-500">
              Actualiza directamente o registo oficial do cliente no SIGESC Central.
            </p>
            <div className="font-ui mt-4 space-y-3 text-sm">
              <input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome *"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={editSurname}
                onChange={(e) => setEditSurname(e.target.value)}
                placeholder="Apelido"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Telefone"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={editNif}
                onChange={(e) => setEditNif(e.target.value)}
                placeholder="NIF"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                placeholder="Morada"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                placeholder="Cidade"
                className="h-10 w-full rounded-md border border-sand-200 px-3"
              />
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={editStatus}
                  onChange={(e) => setEditStatus(e.target.checked)}
                />
                Cliente activo no SIGESC
              </label>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "A guardar…" : "Guardar alterações no SIGESC"}
              </Button>
            </div>
          </form>
        ) : null}

        <form onSubmit={createCustomer} className="surface h-fit p-5">
          <h3 className="text-lg font-semibold text-ink-900">Criar cliente central</h3>
          <p className="font-ui mt-1 text-xs text-stone-500">
            Cliente financeiro no SIGESC — pode existir sem hóspede operacional.
          </p>
          <div className="font-ui mt-4 space-y-3 text-sm">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome *"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="Apelido"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefone"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="NIF"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Morada"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cidade"
              className="h-10 w-full rounded-md border border-sand-200 px-3"
            />
            <Button type="submit" disabled={pending} className="w-full">
              Criar no SIGESC
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
