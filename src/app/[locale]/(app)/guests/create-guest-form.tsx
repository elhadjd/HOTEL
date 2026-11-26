"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type CustomerHit = {
  id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
};

export function CreateGuestForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"existing_customer" | "new_customer">("existing_customer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [centralCustomerId, setCentralCustomerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function searchCustomers(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/v1/integrations/sigesc/customers?search=${encodeURIComponent(q)}&per_page=10`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setHits(data.data ?? []);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body =
        mode === "existing_customer"
          ? {
              mode,
              centralCustomerId,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              email: email || undefined,
              phone: phone || undefined,
            }
          : {
              mode,
              firstName,
              lastName,
              email: email || undefined,
              phone: phone || undefined,
              nif: nif || undefined,
            };

      if (mode === "existing_customer" && !centralCustomerId) {
        setError("Seleccione um cliente central central");
        return;
      }

      const res = await fetch("/api/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setNif("");
      setCentralCustomerId(null);
      setHits([]);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface h-fit p-5">
      <h3 className="text-lg font-semibold text-ink-900">Novo hóspede</h3>
      <p className="font-ui mt-1 text-xs text-stone-500">
        Todo hóspede exige um Cliente financeiro central associado.
      </p>

      <div className="font-ui mt-3 flex gap-2 text-sm">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 ${mode === "existing_customer" ? "bg-teal-100 text-teal-800" : "bg-sand-100"}`}
          onClick={() => setMode("existing_customer")}
        >
          Cliente existente
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 ${mode === "new_customer" ? "bg-teal-100 text-teal-800" : "bg-sand-100"}`}
          onClick={() => setMode("new_customer")}
        >
          Criar cliente + hóspede
        </button>
      </div>

      <div className="font-ui mt-4 space-y-3 text-sm">
        {mode === "existing_customer" ? (
          <>
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar cliente central…"
                className="h-10 flex-1 rounded-md border border-sand-200 px-3"
              />
              <Button type="button" disabled={pending} onClick={searchCustomers}>
                Buscar
              </Button>
            </div>
            {hits.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-auto border border-sand-100 p-2">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left ${
                        centralCustomerId === c.id ? "bg-teal-50" : "hover:bg-sand-50"
                      }`}
                      onClick={() => {
                        setCentralCustomerId(c.id);
                        setFirstName(c.name);
                        setLastName(c.surname ?? "");
                        setEmail(c.email ?? "");
                        setPhone(c.phone ?? "");
                      }}
                    >
                      {c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim()} · #{c.id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {centralCustomerId ? (
              <p className="text-xs text-teal-800">Cliente seleccionado: #{centralCustomerId}</p>
            ) : null}
          </>
        ) : null}

        <label className="block">
          <span className="text-stone-500">Nome</span>
          <input
            required={mode === "new_customer"}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Apelido</span>
          <input
            required={mode === "new_customer"}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Telefone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        {mode === "new_customer" ? (
          <label className="block">
            <span className="text-stone-500">NIF</span>
            <input
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
            />
          </label>
        ) : null}
        {error ? <p className="text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "…" : "Criar hóspede"}
        </Button>
      </div>
    </form>
  );
}
