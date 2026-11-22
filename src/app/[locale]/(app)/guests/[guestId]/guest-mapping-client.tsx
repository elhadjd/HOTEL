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

  const needsResolution =
    syncStatus === "NEEDS_RESOLUTION" || syncStatus === "UNLINKED" || !externalCustomerId;

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
      <h3 className="text-lg font-semibold text-ink-900">Cliente financeiro SIGESC</h3>
      <p className="font-ui mt-1 text-sm text-stone-500">
        Estado: <strong>{syncStatus}</strong>
        {externalCustomerId ? ` · ID ${externalCustomerId}` : ""}
      </p>
      {needsResolution ? (
        <p className="font-ui mt-2 text-sm text-amber-800">
          Este hóspede histórico precisa de resolução explícita — não pode ser usado em reservas ou
          faturas até estar LINKED.
        </p>
      ) : null}
      {error ? <p className="font-ui mt-2 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="font-ui mt-2 text-sm text-teal-800">{info}</p> : null}

      <form onSubmit={search} className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar por NIF, email, telefone…"
          className="font-ui h-10 min-w-[14rem] flex-1 rounded-md border border-sand-200 px-3 text-sm"
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
