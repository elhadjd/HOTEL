"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type StayPayload = {
  id: string;
  status: string;
  hotelName: string;
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
  eligibleInvoiceId,
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
    status: string;
    centralState: string | null;
    centralTotal: number | null;
    currency: string;
    updatedAt: string;
  }>;
  eligibleInvoiceId: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mappingOptions, setMappingOptions] = useState(mappings);

  const active = ["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status);
  const linked =
    stay.guest.customerMapping?.syncStatus === "LINKED" &&
    Boolean(stay.guest.customerMapping.externalCustomerId);

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
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `consume-${crypto.randomUUID()}`
        : `consume-${Date.now()}`;
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stay.id}/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createDocumentIfMissing: createIfMissing,
          idempotencyKey,
          lines: [{ mappingLocalCode: productPick, quantity: Number(qty) || 1 }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha no consumo");
        return;
      }
      setMessage(data.message ?? "Consumo registado");
      setProductPick("");
      setQty("1");
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
            <StatusPill value={linked ? "Cliente SIGESC" : "Sem cliente"} />
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

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Hóspede e alojamento</h2>
          <dl className="font-ui mt-4 grid gap-3 sm:grid-cols-2 text-sm">
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
          <ul className="font-ui mt-2 space-y-1 text-sm">
            {stay.companions.filter((c) => !c.removedAt).length === 0 ? (
              <li className="text-stone-500">Sem acompanhantes</li>
            ) : (
              stay.companions
                .filter((c) => !c.removedAt)
                .map((c) => (
                  <li key={c.id}>
                    {c.guest.name} {c.guest.linked ? "· ligado" : "· sem cliente"}
                  </li>
                ))
            )}
          </ul>
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
                  <Link
                    href={`/integrations/invoices/${inv.id}`}
                    className="font-medium text-teal-700 hover:underline"
                  >
                    {inv.externalId}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusPill value={inv.status} />
                    {inv.centralState ? <StatusPill value={inv.centralState} /> : null}
                  </div>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {inv.centralTotal != null
                      ? money(inv.centralTotal, inv.currency)
                      : "Total central pendente"}
                    {" · "}
                    {new Date(inv.updatedAt).toLocaleString("pt-PT")}
                  </p>
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
              Sem Cotação/Proforma editável — consumo pode criar documento se autorizado.
            </p>
          )}
        </section>
      </div>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold">Conta operacional</h2>
        <p className="font-ui mt-1 text-xs text-stone-500">{account.note}</p>
        <p className="mt-2 text-xl font-semibold">
          {money(account.operationalTotal, account.currency)}
        </p>
        <ul className="font-ui mt-3 divide-y divide-sand-100 text-sm">
          {account.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-2">
              <span>
                {l.description} · qty {Number(l.quantity)} · {l.status}
              </span>
              <span>{money(Number(l.unitPrice) * Number(l.quantity), account.currency)}</span>
            </li>
          ))}
        </ul>
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
                  {h.fromRoomId.slice(0, 8)}… → {h.toRoomId.slice(0, 8)}… · {h.reason} ·{" "}
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
