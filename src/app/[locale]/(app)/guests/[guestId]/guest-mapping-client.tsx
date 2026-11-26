"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Customer = {
  id: number;
  full_name?: string | null;
  name: string;
  surname?: string | null;
  email?: string | null;
  nif?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
};

export function GuestMappingClient({
  guestId,
  syncStatus,
  externalCustomerId,
}: {
  guestId: string;
  syncStatus: string;
  externalCustomerId: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNif, setEditNif] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");

  const needsResolution =
    syncStatus === "NEEDS_RESOLUTION" || syncStatus === "UNLINKED" || !externalCustomerId;

  function loadLinkedForEdit() {
    if (!externalCustomerId) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/customers/${externalCustomerId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar dados do cliente no sistema central");
        return;
      }
      const c = data.customer as Customer;
      setEditName(c.name ?? "");
      setEditSurname(c.surname ?? "");
      setEditEmail(c.email ?? "");
      setEditPhone(c.phone ?? "");
      setEditNif(c.nif ?? "");
      setEditAddress(c.address ?? "");
      setEditCity(c.city ?? "");
      setEditOpen(true);
    });
  }

  function saveLinkedEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!externalCustomerId) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/customers/${externalCustomerId}`, {
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar cliente no sistema central");
        return;
      }
      setEditOpen(false);
      setInfo(`Cliente central #${externalCustomerId} actualizado com sucesso.`);
      router.refresh();
    });
  }

  function search(e: React.FormEvent) {
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
      setCandidates(data.data ?? []);
    });
  }

  function associate(centralCustomerId: number, action: "link" | "reassociate") {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/guests/${guestId}/customer-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, centralCustomerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Association failed");
        return;
      }
      setInfo("Hóspede associado ao cliente central.");
      router.refresh();
    });
  }

  function createFromGuest(forceCreate = false) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/guests/${guestId}/customer-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", forceCreate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Create failed");
        return;
      }
      if (data.needsConfirmation) {
        setCandidates(data.candidates ?? []);
        setInfo("Possíveis clientes existentes. Associe um ou force a criação.");
        return;
      }
      setInfo("Cliente central criado e associado.");
      router.refresh();
    });
  }

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-ink-900">Cliente financeiro central</h3>
          <p className="font-ui mt-1 text-sm text-stone-500">
            Estado: <strong>{syncStatus}</strong>
            {externalCustomerId ? ` · ID ${externalCustomerId}` : ""}
          </p>
        </div>
        {!needsResolution && externalCustomerId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => (editOpen ? setEditOpen(false) : loadLinkedForEdit())}
          >
            {editOpen ? "Fechar edição" : "Editar no sistema central"}
          </Button>
        ) : null}
      </div>

      {needsResolution ? (
        <p className="font-ui mt-2 text-sm text-amber-800">
          Este hóspede histórico precisa de resolução explícita — não pode ser usado em reservas ou
          faturas até estar LINKED.
        </p>
      ) : null}
      {error ? <p className="font-ui mt-2 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="font-ui mt-2 text-sm text-teal-800">{info}</p> : null}

      {editOpen && externalCustomerId ? (
        <form
          onSubmit={saveLinkedEdit}
          className="font-ui mt-4 space-y-2 rounded-md border border-teal-200 bg-teal-50/40 p-4 text-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">
            Editar ficha fiscal no sistema central (#{externalCustomerId})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome *"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
            <input
              value={editSurname}
              onChange={(e) => setEditSurname(e.target.value)}
              placeholder="Apelido"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Email"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="Telefone"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
            <input
              value={editNif}
              onChange={(e) => setEditNif(e.target.value)}
              placeholder="NIF"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
            <input
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              placeholder="Cidade"
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5"
            />
          </div>
          <input
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="Morada"
            className="h-9 w-full rounded-md border border-sand-200 bg-white px-2.5"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "A guardar…" : "Guardar no sistema central"}
          </Button>
        </form>
      ) : null}

      <form onSubmit={search} className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar por NIF, email, telefone…"
          className="font-ui h-10 w-full sm:min-w-[14rem] sm:flex-1 rounded-md border border-sand-200 px-3 text-sm"
        />
        <Button type="submit" disabled={pending}>
          Pesquisar
        </Button>
      </form>

      {candidates.length > 0 ? (
        <ul className="font-ui mt-3 space-y-2 text-sm">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 py-2"
            >
              <div>
                <div className="font-medium">
                  {c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim()}
                </div>
                <div className="text-xs text-stone-500">
                  {[c.email, c.phone, c.nif].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  associate(c.id, needsResolution || !externalCustomerId ? "link" : "reassociate")
                }
              >
                {needsResolution ? "Associar" : "Reassociar"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {needsResolution ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => createFromGuest(false)}>
            Criar cliente a partir do hóspede
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => createFromGuest(true)}
          >
            Forçar criação
          </Button>
        </div>
      ) : (
        <p className="font-ui mt-4 text-xs text-stone-500">
          Desassociar sem substituto não é permitido. Use reassociar para outro cliente válido.
        </p>
      )}
    </div>
  );
}
