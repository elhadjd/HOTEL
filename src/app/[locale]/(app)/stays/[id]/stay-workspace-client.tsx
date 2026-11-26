"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { InvoiceSettlementActions } from "@/components/invoices/invoice-settlement-actions";

type StayPayload = {
  id: string;
  status: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomCode: string;
  categoryName: string;
  actualArrival: string;
  expectedDeparture: string;
  actualDeparture: string | null;
  guest: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    customerMapping: { syncStatus: string; externalCustomerId: string | null } | null;
  };
  companions: Array<{
    id: string;
    removedAt: string | null;
    guest: { id: string; name: string; linked: boolean };
  }>;
  reservation: { id: string; code: string };
  roomHistory: Array<{
    id: string;
    fromRoomId: string;
    toRoomId: string;
    reason: string;
    transferredAt: string;
  }>;
  checkIn: { checkedInAt: string; occupantCount: number } | null;
  checkOut: { checkedOutAt: string; financialHandoffStatus: string } | null;
};

function money(v: number, currency = "AOA") {
  return `${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function StayWorkspaceClient({
  stay,
  account,
  invoices,
  canSettleInvoices = false,
  eligibleInvoiceId,
  unbilledMappedLines,
  availableRooms,
  roomCodeById,
  guestOptions,
  mappings,
  housekeeping,
  maintenance,
}: {
  stay: StayPayload;
  account: {
    operationalTotal: number;
    currency: string;
    note: string;
    lines: Array<{
      id: string;
      description: string;
      quantity: number | string;
      unitPrice: number | string;
      status: string;
      kind: string;
    }>;
  };
  invoices: Array<{
    id: string;
    externalId: string;
    saleKey: string | null;
    orderReference?: string | null;
    status: string;
    centralState: string | null;
    centralTotal: number | null;
    centralRestPayable?: number | null;
    currency: string;
    updatedAt: string;
  }>;
  canSettleInvoices?: boolean;
  eligibleInvoiceId: string | null;
  unbilledMappedLines: Array<{ mappingLocalCode: string; label: string; quantity: number }>;
  availableRooms: Array<{ id: string; code: string; categoryName: string; capacity: number }>;
  roomCodeById: Record<string, string>;
  guestOptions: Array<{ id: string; name: string; email: string | null }>;
  mappings: Array<SearchableOption & { unitPriceHint?: number | null }>;
  housekeeping: Array<{
    id: string;
    kind: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    inspectedAt: string | null;
  }>;
  maintenance: Array<{
    id: string;
    title: string;
    status: string;
    blocksRoom: boolean;
    createdAt: string;
  }>;
}) {
  const router = useRouter();
  const [productPick, setProductPick] = useState("");
  const [qty, setQty] = useState("1");
  const [createIfMissing, setCreateIfMissing] = useState(false);

  // Operational workspace controls (Phase P2)
  const [dateChangeKind, setDateChangeKind] = useState<"EXTENSION" | "EARLY_DEPARTURE">(
    "EXTENSION",
  );
  const [newDeparture, setNewDeparture] = useState(stay.expectedDeparture.slice(0, 10));
  const [dateReason, setDateReason] = useState("");

  const [toRoomId, setToRoomId] = useState(availableRooms[0]?.id ?? "");
  const [transferReason, setTransferReason] = useState("");

  const [companionGuestId, setCompanionGuestId] = useState("");

  const [manualKind, setManualKind] = useState<"FEE" | "DISCOUNT" | "ADJUSTMENT">("FEE");
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");

  const [docState, setDocState] = useState<"Proforma" | "Cotação">("Proforma");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mappingOptions, setMappingOptions] = useState(mappings);
  const pendingKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const active = ["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status);
  const linked =
    stay.guest.customerMapping?.syncStatus === "LINKED" &&
    Boolean(stay.guest.customerMapping.externalCustomerId);

  const activeCompanions = useMemo(
    () => stay.companions.filter((c) => !c.removedAt),
    [stay.companions],
  );
  const availableCompanions = useMemo(() => {
    const existingIds = new Set(activeCompanions.map((c) => c.guest.id));
    return guestOptions.filter((g) => !existingIds.has(g.id));
  }, [activeCompanions, guestOptions]);

  const searchMappings = useCallback(async (query: string) => {
    const params = new URLSearchParams({ take: "50", activeOnly: "1" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/v1/integrations/sigesc/catalog-mappings?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha");
    const next = (data.mappings ?? []).map(
      (m: {
        localCode: string;
        localLabel?: string | null;
        centralName?: string | null;
        centralProductId?: string;
        centralSalePrice?: unknown;
        active?: boolean;
      }) => ({
        value: m.localCode,
        label: m.localLabel || m.centralName || m.localCode,
        keywords: [m.localCode, m.centralProductId ?? "", m.centralName ?? ""],
        description:
          m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
        unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
      }),
    );
    setMappingOptions((prev) => {
      const map = new Map(prev.map((p) => [p.value, p]));
      for (const n of next) map.set(n.value, n);
      return [...map.values()];
    });
    return next;
  }, []);

  const estimate = useMemo(() => {
    const mapping = mappingOptions.find((m) => m.value === productPick);
    const price = mapping?.unitPriceHint ?? 0;
    const q = Number(qty) || 0;
    return Number((price * q).toFixed(2));
  }, [mappingOptions, productPick, qty]);

  function consume(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!productPick) {
      setError("Seleccione um produto mapeado.");
      return;
    }
    const payloadLines = [{ mappingLocalCode: productPick, quantity: Number(qty) || 1 }];
    const signature = JSON.stringify({ stayId: stay.id, createIfMissing, payloadLines });
    if (!pendingKeyRef.current || pendingKeyRef.current.signature !== signature) {
      pendingKeyRef.current = {
        signature,
        key:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `consume-${crypto.randomUUID()}`
            : `consume-${Date.now()}`,
      };
    }
    const idempotencyKey = pendingKeyRef.current.key;
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createDocumentIfMissing: createIfMissing,
          idempotencyKey,
          lines: payloadLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha no consumo");
        return;
      }
      pendingKeyRef.current = null;
      if (data.reconciliationRequired) {
        setError(
          data.message ??
            "Consumo registado localmente, mas envio ao sistema central requer reconciliação.",
        );
      } else {
        setMessage(data.message ?? "Consumo registado");
      }
      setProductPick("");
      setQty("1");
      router.refresh();
    });
  }

  function submitDateChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: dateChangeKind,
          newDeparture,
          reason: dateReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao alterar data de partida");
        return;
      }
      setDateReason("");
      setMessage(
        dateChangeKind === "EXTENSION"
          ? "Estadia estendida e alojamento recalculado automaticamente."
          : "Saída antecipada registada, noites futuras libertadas e alojamento recalculado.",
      );
      router.refresh();
    });
  }

  function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!toRoomId || !transferReason.trim()) {
      setError("Seleccione o quarto de destino e indique o motivo da transferência.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toRoomId, reason: transferReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao transferir quarto");
        return;
      }
      setTransferReason("");
      setMessage("Transferência concluída — quarto anterior enviado para limpeza/turnover.");
      router.refresh();
    });
  }

  function addStayCompanion(e: React.FormEvent) {
    e.preventDefault();
    if (!companionGuestId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/companions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", guestId: companionGuestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao adicionar acompanhante");
        return;
      }
      setCompanionGuestId("");
      setMessage("Acompanhante adicionado à estadia.");
      router.refresh();
    });
  }

  function removeStayCompanion(guestId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/companions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", guestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao remover acompanhante");
        return;
      }
      setMessage("Acompanhante removido.");
      router.refresh();
    });
  }

  function addManualCharge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const amountNum = Number(manualAmount);
    if (!manualDesc.trim() || !Number.isFinite(amountNum)) {
      setError("Indique descrição e valor numérico válido.");
      return;
    }
    const signedPrice = manualKind === "DISCOUNT" ? -Math.abs(amountNum) : amountNum;
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          kind: manualKind,
          description: manualDesc.trim(),
          quantity: 1,
          manualUnitPrice: signedPrice,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao lançar movimento");
        return;
      }
      setManualDesc("");
      setManualAmount("");
      setMessage("Movimento operacional lançado na conta da estadia.");
      router.refresh();
    });
  }

  function voidCharge(chargeId: string) {
    const reason = window.prompt("Motivo da anulação do lançamento:");
    if (!reason || !reason.trim()) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", chargeId, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao anular lançamento");
        return;
      }
      setMessage("Lançamento anulado.");
      router.refresh();
    });
  }

  function createAndSubmitSigescDocument() {
    if (unbilledMappedLines.length === 0) {
      setError("Não existem lançamentos mapeados por enviar ao sistema central.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const draftRes = await fetch("/api/v1/integrations/sigesc/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: stay.guest.id,
          reservationId: stay.reservation.id,
          stayId: stay.id,
          hotelId: stay.hotelId,
          state: docState,
          notes: `Estadia ${stay.id} · Quarto ${stay.roomCode}`,
          lines: unbilledMappedLines.map((l) => ({
            mappingLocalCode: l.mappingLocalCode,
            quantity: l.quantity,
          })),
        }),
      });
      const draftData = await draftRes.json().catch(() => ({}));
      if (!draftRes.ok) {
        setError(draftData.error ?? "Falha ao criar rascunho central");
        return;
      }
      const invId = draftData.invoice?.id as string;
      const submitRes = await fetch(`/api/v1/integrations/sigesc/invoices/${invId}/submit`, {
        method: "POST",
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        setError(
          `Rascunho criado, mas submissão ao sistema central falhou: ${submitData.error ?? "erro remoto"}`,
        );
        router.refresh();
        return;
      }
      if (submitData.reconciliationRequired) {
        setError(
          submitData.warning ??
            "Documento ficou em reconciliação pendente no sistema central — verifique antes de reenviar.",
        );
      } else {
        setMessage(`${docState} criada e confirmada no sistema central (${submitData.invoice?.saleKey ?? invId}).`);
      }
      router.refresh();
    });
  }

  function refreshCentralInvoice(invoiceId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${invoiceId}/refresh`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao sincronizar documento com o sistema central");
        return;
      }
      setMessage(
        `Documento actualizado do sistema central: estado ${data.invoice?.centralState ?? data.invoice?.status ?? "—"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">{stay.guest.name}</h1>
          <p className="font-ui mt-1 text-sm text-stone-500">
            {stay.hotelName} · Quarto {stay.roomCode} ({stay.categoryName}) · Reserva{" "}
            {stay.reservation.code}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusPill value={stay.status} />
            <StatusPill value={linked ? "Cliente central" : "Sem cliente"} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {active ? (
            <Link href={`/check-out?stayId=${stay.id}`}>
              <Button type="button" variant="secondary">
                Check-out
              </Button>
            </Link>
          ) : null}
          <Link href={`/operations/consumption?stayId=${stay.id}`}>
            <Button type="button">Consumo</Button>
          </Link>
        </div>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Hóspede e alojamento</h2>
          <dl className="font-ui mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">Contacto</dt>
              <dd>
                {stay.guest.email ?? "—"} · {stay.guest.phone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Cliente central</dt>
              <dd>{stay.guest.customerMapping?.externalCustomerId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Check-in</dt>
              <dd>
                {stay.checkIn
                  ? new Date(stay.checkIn.checkedInAt).toLocaleString("pt-PT")
                  : new Date(stay.actualArrival).toLocaleString("pt-PT")}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Partida prevista</dt>
              <dd>{stay.expectedDeparture.slice(0, 10)}</dd>
            </div>
          </dl>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-stone-400">
            Acompanhantes
          </h3>
          <ul className="font-ui mt-2 space-y-1.5 text-sm">
            {activeCompanions.length === 0 ? (
              <li className="text-stone-500">Sem acompanhantes</li>
            ) : (
              activeCompanions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    {c.guest.name} {c.guest.linked ? "· ligado" : "· sem cliente"}
                  </span>
                  {active ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeStayCompanion(c.guest.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Remover
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          {active && availableCompanions.length > 0 ? (
            <form onSubmit={addStayCompanion} className="font-ui mt-3 flex flex-wrap gap-2 text-sm">
              <select
                value={companionGuestId}
                onChange={(e) => setCompanionGuestId(e.target.value)}
                className="h-9 flex-1 rounded-md border border-sand-200 bg-white px-2 text-xs"
              >
                <option value="">Adicionar acompanhante ligado ao sistema central…</option>
                {availableCompanions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.email ? ` (${g.email})` : ""}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={pending || !companionGuestId}
              >
                Adicionar
              </Button>
            </form>
          ) : null}
        </section>

        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Documentos financeiros</h2>
          <p className="font-ui mt-1 text-xs text-stone-500">
            Totais oficiais = Aggregate. Conta operacional local não é fiscal.
          </p>
          <ul className="mt-3 space-y-2">
            {invoices.length === 0 ? (
              <li className="font-ui text-sm text-stone-500">Sem documentos ligados</li>
            ) : (
              invoices.map((inv) => (
                <li key={inv.id} className="border-b border-sand-100 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/integrations/invoices/${inv.id}`}
                      className="font-mono font-medium text-teal-700 hover:underline"
                    >
                      {inv.orderReference &&
                      !inv.orderReference.startsWith("HOT-INV-") &&
                      !inv.orderReference.startsWith("API-HOT-INV-")
                        ? inv.orderReference
                        : "Rascunho local"}
                    </Link>
                    {inv.saleKey ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => refreshCentralInvoice(inv.id)}
                        className="font-ui text-xs text-stone-500 underline hover:text-ink-900"
                      >
                        Sincronizar
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusPill value={inv.status} />
                    {inv.centralState ? <StatusPill value={inv.centralState} /> : null}
                  </div>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {inv.centralTotal != null
                      ? money(inv.centralTotal, inv.currency)
                      : "Total central pendente"}
                    {inv.centralRestPayable != null
                      ? ` · Por liquidar: ${money(inv.centralRestPayable, inv.currency)}`
                      : ""}
                    {" · "}
                    {new Date(inv.updatedAt).toLocaleString("pt-PT")}
                  </p>
                  <InvoiceSettlementActions
                    compact
                    canSettle={canSettleInvoices}
                    invoice={{
                      id: inv.id,
                      externalId: inv.externalId,
                      saleKey: inv.saleKey,
                      orderReference: inv.orderReference ?? null,
                      status: inv.status,
                      centralState: inv.centralState,
                      centralTotal: inv.centralTotal,
                      centralRestPayable: inv.centralRestPayable ?? null,
                      currency: inv.currency,
                    }}
                  />
                </li>
              ))
            )}
          </ul>
          {eligibleInvoiceId ? (
            <p className="font-ui mt-3 text-xs text-teal-800">
              Documento elegível para append:{" "}
              <Link
                href={`/integrations/invoices/${eligibleInvoiceId}`}
                className="underline"
              >
                abrir
              </Link>
            </p>
          ) : (
            <p className="font-ui mt-3 text-xs text-stone-500">
              Sem Cotação/Proforma editável — pode criar e submeter abaixo em 1 clique.
            </p>
          )}
          {active && linked && unbilledMappedLines.length > 0 ? (
            <div className="font-ui mt-4 space-y-2 border-t border-sand-100 pt-3">
              <p className="text-xs text-stone-600">
                {unbilledMappedLines.length} linha(s) mapeada(s) pronta(s) para envio ao sistema central.
              </p>
              <div className="flex gap-2">
                <select
                  value={docState}
                  onChange={(e) => setDocState(e.target.value as "Proforma" | "Cotação")}
                  className="h-9 rounded-md border border-sand-200 bg-white px-2 text-xs"
                >
                  <option value="Proforma">Proforma</option>
                  <option value="Cotação">Cotação</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={createAndSubmitSigescDocument}
                  className="flex-1"
                >
                  Emitir no sistema central
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {active ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={submitDateChange} className="surface p-5">
            <h2 className="text-lg font-semibold">Estender estadia / Saída antecipada</h2>
            <p className="font-ui mt-1 text-xs text-stone-500">
              Verifica disponibilidade com bloqueio transacional, actualiza a reserva e recalcula o
              alojamento por faturar.
            </p>
            <div className="font-ui mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-stone-500">Acção</span>
                <select
                  value={dateChangeKind}
                  onChange={(e) =>
                    setDateChangeKind(e.target.value as "EXTENSION" | "EARLY_DEPARTURE")
                  }
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                >
                  <option value="EXTENSION">Estender estadia</option>
                  <option value="EARLY_DEPARTURE">Antecipar saída</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-stone-500">Nova partida prevista</span>
                <input
                  type="date"
                  required
                  value={newDeparture}
                  onChange={(e) => setNewDeparture(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                />
              </label>
            </div>
            <label className="font-ui mt-3 block text-sm">
              <span className="text-xs text-stone-500">Motivo (opcional)</span>
              <input
                value={dateReason}
                onChange={(e) => setDateReason(e.target.value)}
                placeholder="Pedido do hóspede, alteração de voo…"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={pending} className="mt-4">
              Aplicar alteração de datas
            </Button>
          </form>

          <form onSubmit={submitTransfer} className="surface p-5">
            <h2 className="text-lg font-semibold">Transferir quarto</h2>
            <p className="font-ui mt-1 text-xs text-stone-500">
              Move a estadia atomicamente, gera turnover no quarto anterior e recalcula a tarifa se
              a categoria mudar.
            </p>
            {availableRooms.length === 0 ? (
              <p className="font-ui mt-4 text-sm text-stone-500">
                Nenhum outro quarto limpo e livre disponível neste hotel neste momento.
              </p>
            ) : (
              <>
                <div className="font-ui mt-4 space-y-3 text-sm">
                  <label className="block">
                    <span className="text-xs text-stone-500">Quarto de destino</span>
                    <select
                      value={toRoomId}
                      onChange={(e) => setToRoomId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                    >
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} · {r.categoryName} (cap. {r.capacity})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-stone-500">Motivo obrigatório</span>
                    <input
                      required
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="Upgrade, ruído, manutenção…"
                      className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                    />
                  </label>
                </div>
                <Button type="submit" variant="secondary" disabled={pending} className="mt-4">
                  Confirmar transferência
                </Button>
              </>
            )}
          </form>
        </div>
      ) : null}

      <section className="surface p-5">
        <h2 className="text-lg font-semibold">Conta operacional</h2>
        <p className="font-ui mt-1 text-xs text-stone-500">{account.note}</p>
        <p className="mt-2 text-xl font-semibold">
          {money(account.operationalTotal, account.currency)}
        </p>
        <ul className="font-ui mt-3 divide-y divide-sand-100 text-sm">
          {account.lines.length === 0 ? (
            <li className="py-2 text-stone-500">Sem lançamentos operacionais.</li>
          ) : (
            account.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-ink-900">{l.description}</span> · {l.kind} · qty{" "}
                  {Number(l.quantity)} · {l.status}
                </span>
                <div className="flex items-center gap-3">
                  <span>{money(Number(l.unitPrice) * Number(l.quantity), account.currency)}</span>
                  {active && l.status !== "HANDED_OFF" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => voidCharge(l.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Anular
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>

        {active ? (
          <form
            onSubmit={addManualCharge}
            className="font-ui mt-4 grid gap-2 border-t border-sand-100 pt-4 text-sm sm:grid-cols-[0.8fr_1.5fr_0.7fr_auto]"
          >
            <select
              value={manualKind}
              onChange={(e) => setManualKind(e.target.value as "FEE" | "DISCOUNT" | "ADJUSTMENT")}
              className="h-10 rounded-md border border-sand-200 bg-white px-2 text-xs"
            >
              <option value="FEE">Taxa</option>
              <option value="DISCOUNT">Desconto</option>
              <option value="ADJUSTMENT">Ajuste</option>
            </select>
            <input
              value={manualDesc}
              onChange={(e) => setManualDesc(e.target.value)}
              placeholder="Descrição (ex.: late check-out, cortesia…)"
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
            <input
              type="number"
              step="0.01"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder="Valor"
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
            <Button type="submit" variant="secondary" disabled={pending}>
              Lançar
            </Button>
          </form>
        ) : null}
      </section>

      {active ? (
        <form onSubmit={consume} className="surface p-5">
          <h2 className="text-lg font-semibold">Registar consumo</h2>
          <p className="font-ui mt-1 text-sm text-stone-500">
            Produtos do catálogo mapeado; preço verificado no servidor. Estimativa local não é
            autoridade.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_0.5fr_auto]">
            <SearchableSelect
              options={mappingOptions}
              value={productPick}
              onChange={setProductPick}
              onSearch={searchMappings}
              labels={{ placeholder: "Produto mapeado", searchPlaceholder: "SKU / nome…" }}
            />
            <input
              type="number"
              min="0.001"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-10 rounded-md border border-sand-200 bg-white px-3 text-sm"
            />
            <Button type="submit" disabled={pending}>
              Confirmar
            </Button>
          </div>
          <p className="font-ui mt-2 text-xs text-stone-500">
            Estimativa: {money(estimate)} (só referência)
          </p>
          <label className="font-ui mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createIfMissing}
              onChange={(e) => setCreateIfMissing(e.target.checked)}
            />
            Criar Cotação se não existir documento elegível
          </label>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Histórico de quartos</h2>
          <ul className="font-ui mt-3 space-y-2 text-sm">
            {stay.roomHistory.length === 0 ? (
              <li className="text-stone-500">Sem transferências</li>
            ) : (
              stay.roomHistory.map((h) => (
                <li key={h.id}>
                  {roomCodeById[h.fromRoomId] ?? `${h.fromRoomId.slice(0, 8)}…`} →{" "}
                  {roomCodeById[h.toRoomId] ?? `${h.toRoomId.slice(0, 8)}…`} · {h.reason} ·{" "}
                  {new Date(h.transferredAt).toLocaleString("pt-PT")}
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Governança / manutenção do quarto</h2>
          <ul className="font-ui mt-3 space-y-2 text-sm">
            {housekeeping.slice(0, 5).map((t) => (
              <li key={t.id}>
                HK {t.kind} · {t.status} · {new Date(t.createdAt).toLocaleString("pt-PT")}
              </li>
            ))}
            {maintenance.slice(0, 5).map((m) => (
              <li key={m.id}>
                Maint {m.title} · {m.status}
                {m.blocksRoom ? " · bloqueia" : ""}
              </li>
            ))}
            {housekeeping.length === 0 && maintenance.length === 0 ? (
              <li className="text-stone-500">Sem eventos recentes</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
