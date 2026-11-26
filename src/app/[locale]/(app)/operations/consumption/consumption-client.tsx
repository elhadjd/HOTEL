"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Line = {
  key: string;
  mappingLocalCode: string;
  label: string;
  quantity: string;
  unitPriceHint: number | null;
};

export function ConsumptionClient({
  stays,
  mappings,
  initialStayId,
}: {
  stays: SearchableOption[];
  mappings: Array<SearchableOption & { unitPriceHint?: number | null }>;
  initialStayId?: string;
}) {
  const [stayId, setStayId] = useState(initialStayId ?? "");
  const [productPick, setProductPick] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [createIfMissing, setCreateIfMissing] = useState(false);
  const [mappingOptions, setMappingOptions] = useState(mappings);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const estimate = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      total += (l.unitPriceHint ?? 0) * (Number(l.quantity) || 0);
    }
    return Number(total.toFixed(2));
  }, [lines]);

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

  function addLine() {
    const mapping =
      mappingOptions.find((m) => m.value === productPick) ??
      mappings.find((m) => m.value === productPick);
    if (!mapping) return;
    setLines((prev) => [
      ...prev,
      {
        key: `${mapping.value}-${Date.now()}`,
        mappingLocalCode: mapping.value,
        label: mapping.label,
        quantity: "1",
        unitPriceHint: mapping.unitPriceHint ?? null,
      },
    ]);
    setProductPick("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setInvoiceId(null);
    if (!stayId) {
      setError("Seleccione uma estadia activa.");
      return;
    }
    if (!lines.length) {
      setError("Adicione produtos.");
      return;
    }
    const payloadLines = lines.map((l) => ({
      mappingLocalCode: l.mappingLocalCode,
      quantity: Number(l.quantity) || 1,
    }));
    const signature = JSON.stringify({ stayId, createIfMissing, payloadLines });
    if (!pendingKeyRef.current || pendingKeyRef.current.signature !== signature) {
      pendingKeyRef.current = {
        signature,
        key:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `consume-ui-${crypto.randomUUID()}`
            : `consume-ui-${Date.now()}`,
      };
    }
    const idempotencyKey = pendingKeyRef.current.key;
    startTransition(async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/consume`, {
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
        setError(data.error ?? "Falha");
        return;
      }
      pendingKeyRef.current = null;
      setInvoiceId(data.invoice?.id ?? null);
      if (data.reconciliationRequired) {
        setError(data.message ?? "Consumo registado localmente, mas envio ao sistema central requer reconciliação.");
      } else {
        setMessage(data.message ?? "Consumo registado");
      }
      setLines([]);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900">Consumo operacional</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
          Regista produtos mapeados na conta da estadia e anexa a uma Cotação/Proforma elegível via
          Aggregate. Não é um POS de restaurante nem gestão de stock.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? (
        <p className="font-ui text-sm text-teal-800">
          {message}{" "}
          {invoiceId ? (
            <Link href={`/integrations/invoices/${invoiceId}`} className="underline">
              Abrir documento
            </Link>
          ) : null}
        </p>
      ) : null}

      <form onSubmit={submit} className="surface max-w-2xl space-y-4 p-5">
        <label className="block text-sm">
          <span className="text-stone-500">Estadia / quarto</span>
          <SearchableSelect
            className="mt-1"
            options={stays}
            value={stayId}
            onChange={setStayId}
            labels={{ placeholder: "Seleccionar estadia activa" }}
          />
        </label>

        <div className="flex gap-2">
          <SearchableSelect
            className="flex-1"
            options={mappingOptions}
            value={productPick}
            onChange={setProductPick}
            onSearch={searchMappings}
            labels={{ placeholder: "Produto mapeado", searchPlaceholder: "SKU…" }}
          />
          <Button type="button" variant="secondary" onClick={addLine}>
            Adicionar
          </Button>
        </div>

        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.key} className="surface-muted flex items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{l.label}</p>
                <p className="text-xs text-stone-500">
                  Ref. {(l.unitPriceHint ?? 0).toFixed(2)} AOA
                </p>
              </div>
              <input
                type="number"
                min="0.001"
                step="any"
                value={l.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((x) =>
                      x.key === l.key ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
                className="h-9 w-24 rounded-md border border-sand-200 bg-white px-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>

        <p className="font-ui text-sm text-stone-500">
          Estimativa local: {estimate.toFixed(2)} AOA — não autoritativa. Totais oficiais só após
          resposta Aggregate.
        </p>

        <label className="font-ui flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createIfMissing}
            onChange={(e) => setCreateIfMissing(e.target.checked)}
          />
          Criar Cotação se não existir documento elegível
        </label>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "A processar…" : "Confirmar consumo"}
        </Button>
      </form>
    </div>
  );
}
