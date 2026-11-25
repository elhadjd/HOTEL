"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SigescHubClient({
  hasConnection,
  currentHost,
  lastUsersSyncAt,
  lastError,
}: {
  hasConnection: boolean;
  currentHost: string | null;
  lastUsersSyncAt: string | null;
  lastError: string | null;
}) {
  const router = useRouter();
  const [newApiKey, setNewApiKey] = useState("");
  const [newHost, setNewHost] = useState(currentHost ?? "");
  const [showRotate, setShowRotate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(lastError);
  const [pending, startTransition] = useTransition();

  if (!hasConnection) return null;

  function testConnection() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Teste de conectividade falhou");
        return;
      }
      setMessage(
        `Ligação SIGESC confirmada (${data.mode} · ${data.endpoint} · ${data.latencyMs}ms · empresa #${data.companyId}).`,
      );
      router.refresh();
    });
  }

  function syncUsers() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_users" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sincronização de utilizadores falhou");
        return;
      }
      setMessage(
        `Utilizadores sincronizados com o SIGESC: ${data.usersUpserted} utilizador(es) em ${data.pagesProcessed} página(s).`,
      );
      router.refresh();
    });
  }

  function syncInvoices() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/invoices/sync", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sincronização de documentos falhou");
        return;
      }
      setMessage(
        `Documentos sincronizados: ${data.checked} verificados, ${data.updated} com novo estado no SIGESC${data.failed ? `, ${data.failed} com erro` : ""}.`,
      );
      router.refresh();
    });
  }

  function rotateKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/integrations/sigesc/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rotate_key",
          apiKey: newApiKey,
          host: newHost.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Rotação de chave falhou");
        return;
      }
      setNewApiKey("");
      setShowRotate(false);
      setMessage(
        `Chave API rodada com sucesso (prefixo ${data.keyPrefix} · host ${data.host}).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-5 space-y-4 border-t border-sand-200 pt-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={testConnection}>
          Testar ligação ao vivo
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={syncUsers}>
          Sincronizar utilizadores SIGESC
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={syncInvoices}>
          Sincronizar estados financeiros
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setShowRotate((v) => !v)}
        >
          {showRotate ? "Cancelar rotação" : "Rodar chave API (mca_)"}
        </Button>
      </div>

      {lastUsersSyncAt ? (
        <p className="font-ui text-xs text-stone-500">
          Última sincronização de utilizadores:{" "}
          {new Date(lastUsersSyncAt).toLocaleString("pt-PT")}
        </p>
      ) : null}

      {error ? (
        <p className="font-ui rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="font-ui rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {message}
        </p>
      ) : null}

      {showRotate ? (
        <form
          onSubmit={rotateKey}
          className="font-ui space-y-3 rounded-lg border border-sand-200 bg-sand-50/60 p-4 text-sm"
        >
          <p className="text-xs text-stone-600">
            A nova chave <code>mca_</code> é validada contra o SIGESC e tem de pertencer à mesma
            empresa ligada a esta instituição.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-stone-500">Nova chave mca_</span>
              <input
                type="password"
                required
                minLength={20}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="mca_..."
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-500">Host SIGESC (opcional)</span>
              <input
                type="url"
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                placeholder="https://app.sisgesc.net"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
          </div>
          <Button type="submit" disabled={pending || newApiKey.trim().length < 20}>
            {pending ? "A validar…" : "Validar e substituir chave"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
