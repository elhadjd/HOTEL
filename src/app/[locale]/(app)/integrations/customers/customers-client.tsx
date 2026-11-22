"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Customer = {
  id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  customer_code?: string | null;
  status?: boolean;
};

export function CustomersClient({
  initial,
  pagination,
}: {
  initial: Customer[];
  pagination?: { current_page?: number; per_page?: number; total?: number; last_page?: number };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(initial);
  const [meta, setMeta] = useState(pagination);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/v1/integrations/sigesc/customers?search=${encodeURIComponent(q)}&per_page=25`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setRows(data.data ?? []);
      setMeta(data.meta?.pagination);
    });
  }

  function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, surname, email: email || null, phone: phone || null, nif: nif || null }),
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
      router.refresh();
      setRows((prev) => [data.customer, ...prev]);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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
        {error ? <p className="font-ui mb-3 text-sm text-red-700">{error}</p> : null}
        <div className="surface overflow-hidden">
          {rows.length === 0 ? (
            <p className="font-ui p-6 text-sm text-stone-500">Sem clientes nesta página.</p>
          ) : (
            <table className="font-ui w-full text-left text-sm">
              <thead className="border-b border-sand-200 bg-sand-50/80 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">NIF</th>
                  <th className="px-4 py-3">Código</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-sand-100">
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim()}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{c.nif ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-500">{c.customer_code ?? c.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {meta ? (
          <p className="font-ui mt-2 text-xs text-stone-500">
            Página {meta.current_page ?? 1} · {meta.total ?? rows.length} total · não assume
            catálogo completo numa só página
          </p>
        ) : null}
      </div>

      <form onSubmit={createCustomer} className="surface h-fit p-5">
        <h3 className="text-lg font-semibold text-ink-900">Criar cliente central</h3>
        <p className="font-ui mt-1 text-xs text-stone-500">
          Operação remota no SIGESC. Email, NIF e código podem ser únicos por empresa.
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
          <Button type="submit" disabled={pending} className="w-full">
            Criar no SIGESC
          </Button>
        </div>
      </form>
    </div>
  );
}
