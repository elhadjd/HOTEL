"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type FolioRow = {
  id: string;
  name: string;
  folioType: string;
  payerGuestId: string | null;
  payerGuestName: string | null;
  depositAmount: number;
  notes: string | null;
};

type ChargeRow = {
  id: string;
  folioId: string | null;
  description: string;
  kind: string;
  status: string;
  quantity: number;
  unitPrice: number;
  hasCatalogMapping: boolean;
};

function money(v: number, currency = "AOA") {
  return `${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function StayFoliosPanel({
  stayId,
  active,
  currency,
  primaryGuestName,
  folios,
  charges,
  payerOptions,
}: {
  stayId: string;
  active: boolean;
  currency: string;
  primaryGuestName: string;
  folios: FolioRow[];
  charges: ChargeRow[];
  payerOptions: Array<{ id: string; name: string; email: string | null }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [folioType, setFolioType] = useState<"COMPANY" | "AGENCY" | "EXTRAS" | "GUEST">("COMPANY");
  const [payerGuestId, setPayerGuestId] = useState("");
  const [depositAmount, setDepositAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createFolio(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/folios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          folioType,
          payerGuestId: payerGuestId || null,
          depositAmount: Number(depositAmount) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar folio");
        return;
      }
      setName("");
      setPayerGuestId("");
      setDepositAmount("0");
      setMessage("Folio criado com sucesso.");
      router.refresh();
    });
  }

  function assignCharge(chargeId: string, targetFolioId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/folios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          chargeId,
          folioId: targetFolioId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao mover lançamento para o folio");
        return;
      }
      setMessage("Lançamento movido de folio.");
      router.refresh();
    });
  }

  function emitFolio(folioId: string | null, state: "Proforma" | "Cotação") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/folios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "emit_sigesc", folioId, state }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao emitir documento do folio no sistema central");
        return;
      }
      if (data.reconciliationRequired) {
        setError(data.message ?? "Documento do folio ficou pendente de reconciliação.");
      } else {
        setMessage(data.message ?? "Documento emitido no sistema central.");
      }
      router.refresh();
    });
  }

  function updateDeposit(folioId: string, currentDeposit: number) {
    const raw = window.prompt(
      `Novo valor de caução / adiantamento (${currency}):`,
      String(currentDeposit),
    );
    if (raw == null) return;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) {
      setError("Valor de caução inválido.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/folios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deposit", folioId, depositAmount: val }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar caução");
        return;
      }
      setMessage("Caução/adiantamento actualizado.");
      router.refresh();
    });
  }

  const buckets: Array<{
    id: string | null;
    name: string;
    subtitle: string;
    depositAmount: number;
    lines: ChargeRow[];
  }> = [
    {
      id: null,
      name: "Folio Principal (Hóspede)",
      subtitle: primaryGuestName,
      depositAmount: 0,
      lines: charges.filter((c) => !c.folioId),
    },
    ...folios.map((f) => ({
      id: f.id,
      name: `${f.name} (${f.folioType})`,
      subtitle: f.payerGuestName ? `Pagador: ${f.payerGuestName}` : `Pagador: ${primaryGuestName}`,
      depositAmount: f.depositAmount,
      lines: charges.filter((c) => c.folioId === f.id),
    })),
  ];

  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink-900">
        Folios Múltiplos (Split Billing) & Cauções
      </h2>
      <p className="font-ui mt-1 text-xs text-stone-500">
        Separe alojamento (ex.: faturado à empresa/agência) de extras/minibar (hóspede) e emita
        Proformas independentes no sistema central para cada pagador.
      </p>

      {error ? (
        <p className="font-ui mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="font-ui mt-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {buckets.map((bucket) => {
          const total = bucket.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
          const balance = total - bucket.depositAmount;
          const unbilledMappedCount = bucket.lines.filter(
            (l) => l.status === "CONFIRMED" && l.hasCatalogMapping,
          ).length;

          return (
            <div
              key={bucket.id ?? "main"}
              className="rounded-lg border border-sand-200 bg-sand-50/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink-900">{bucket.name}</h3>
                  <p className="font-ui text-xs text-stone-500">{bucket.subtitle}</p>
                </div>
                <div className="font-ui text-right text-xs">
                  <p className="font-semibold text-ink-900">{money(total, currency)}</p>
                  {bucket.id ? (
                    <button
                      type="button"
                      disabled={pending || !active}
                      onClick={() => updateDeposit(bucket.id!, bucket.depositAmount)}
                      className="text-stone-500 underline hover:text-ink-900"
                    >
                      Caução: {money(bucket.depositAmount, currency)}
                    </button>
                  ) : null}
                  {bucket.depositAmount > 0 ? (
                    <p className="text-teal-800">Saldo: {money(balance, currency)}</p>
                  ) : null}
                </div>
              </div>

              <ul className="font-ui mt-3 divide-y divide-sand-100 text-xs">
                {bucket.lines.length === 0 ? (
                  <li className="py-2 text-stone-400">Sem lançamentos neste folio.</li>
                ) : (
                  bucket.lines.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        {l.description} · {l.quantity}× ({l.status})
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{money(l.unitPrice * l.quantity, currency)}</span>
                        {active && l.status !== "HANDED_OFF" && folios.length > 0 ? (
                          <select
                            aria-label="Mover para folio"
                            value={l.folioId ?? ""}
                            disabled={pending}
                            onChange={(e) => assignCharge(l.id, e.target.value)}
                            className="h-7 rounded border border-sand-200 bg-white px-1 text-[11px]"
                          >
                            <option value="">Principal</option>
                            {folios.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>

              {active && unbilledMappedCount > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-sand-100 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => emitFolio(bucket.id, "Proforma")}
                  >
                    Emitir Proforma central ({unbilledMappedCount})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => emitFolio(bucket.id, "Cotação")}
                  >
                    Emitir Cotação
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {active ? (
        <form
          onSubmit={createFolio}
          className="font-ui mt-4 grid gap-2 border-t border-sand-100 pt-4 text-sm grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do novo folio (ex.: Empresa ABC)"
            className="h-10 rounded-md border border-sand-200 bg-white px-3 sm:col-span-2"
          />
          <select
            value={folioType}
            onChange={(e) =>
              setFolioType(e.target.value as "COMPANY" | "AGENCY" | "EXTRAS" | "GUEST")
            }
            className="h-10 rounded-md border border-sand-200 bg-white px-2 text-xs"
          >
            <option value="COMPANY">Empresa</option>
            <option value="AGENCY">Agência</option>
            <option value="EXTRAS">Extras</option>
            <option value="GUEST">Hóspede</option>
          </select>
          <select
            value={payerGuestId}
            onChange={(e) => setPayerGuestId(e.target.value)}
            className="h-10 rounded-md border border-sand-200 bg-white px-2 text-xs"
          >
            <option value="">Pagador: Hóspede principal</option>
            {payerOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Caução"
              className="h-10 w-24 rounded-md border border-sand-200 bg-white px-2 text-xs"
            />
            <Button type="submit" variant="secondary" disabled={pending} className="flex-1">
              Criar folio
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
