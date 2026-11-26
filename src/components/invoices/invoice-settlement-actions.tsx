"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type {
  AggregateBankAccount,
  AggregatePaymentMethod,
  AggregateSalePayment,
} from "@/modules/sigesc-integration/types";

export type SettleableInvoiceSummary = {
  id: string;
  externalId: string;
  saleKey: string | null;
  orderReference?: string | null;
  status: string;
  centralState: string | null;
  centralTotal: number | null;
  centralRestPayable: number | null;
  currency: string;
};

const EDITABLE_STATES = new Set(["Cotação", "Proforma"]);
const PAYABLE_STATES = new Set(["Publicado", "Publicada", "Parcial"]);
const PAID_STATES = new Set(["Pago", "Paga", "Paid"]);
const CANCELLED_STATES = new Set(["Anulado", "Anulada", "Cancelado", "Cancelada"]);

function makeIdempotencyKey(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMoney(value: number | null | undefined, currency = "AOA"): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function InvoiceSettlementActions({
  invoice: initialInvoice,
  canSettle = true,
  compact = false,
  onUpdated,
}: {
  invoice: SettleableInvoiceSummary;
  canSettle?: boolean;
  compact?: boolean;
  onUpdated?: (payload: {
    invoice: Record<string, unknown>;
    payments?: AggregateSalePayment[];
  }) => void;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [methods, setMethods] = useState<AggregatePaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<AggregateBankAccount[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [showPayForm, setShowPayForm] = useState(!compact);
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const publishKeyRef = useRef<string | null>(null);
  const paymentKeyRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    setInvoice(initialInvoice);
  }, [initialInvoice]);

  const remaining =
    invoice.centralRestPayable != null
      ? Number(invoice.centralRestPayable)
      : invoice.centralTotal != null
        ? Number(invoice.centralTotal)
        : 0;

  const isSubmitted =
    Boolean(invoice.saleKey) &&
    (invoice.status === "CREATED" || invoice.status === "RECONCILIATION_REQUIRED");
  const isPaid =
    PAID_STATES.has(invoice.centralState ?? "") ||
    (invoice.centralRestPayable != null && Number(invoice.centralRestPayable) <= 0.004);
  const isCancelled = CANCELLED_STATES.has(invoice.centralState ?? "");
  const canPublish =
    canSettle && isSubmitted && EDITABLE_STATES.has(invoice.centralState ?? "");
  const canPay =
    canSettle &&
    isSubmitted &&
    !isPaid &&
    !isCancelled &&
    PAYABLE_STATES.has(invoice.centralState ?? "") &&
    remaining > 0.004;

  useEffect(() => {
    if (canPay && remaining > 0) {
      setAmount(remaining.toFixed(2));
    }
  }, [canPay, remaining]);

  const loadPaymentMethods = useCallback(async () => {
    if (methodsLoaded) return;
    setMethodsError(null);
    try {
      const res = await fetch("/api/v1/integrations/sigesc/payment-methods");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMethodsError(data.error ?? "Falha ao carregar métodos de pagamento do sistema central");
        return;
      }
      const nextMethods = (data.payment_methods ?? []) as AggregatePaymentMethod[];
      const nextAccounts = (data.bank_accounts ?? []) as AggregateBankAccount[];
      setMethods(nextMethods);
      setAccounts(nextAccounts);
      setMethodsLoaded(true);
      if (nextMethods.length > 0 && !paymentMethodId) {
        setPaymentMethodId(String(nextMethods[0].id));
        if (nextMethods[0].default_bank_account_id) {
          setBankAccountId(String(nextMethods[0].default_bank_account_id));
        }
      }
    } catch {
      setMethodsError("Não foi possível consultar métodos de pagamento no sistema central.");
    }
  }, [methodsLoaded, paymentMethodId]);

  useEffect(() => {
    if (canPay && showPayForm && !methodsLoaded) {
      void loadPaymentMethods();
    }
  }, [canPay, showPayForm, methodsLoaded, loadPaymentMethods]);

  function applyLocalUpdate(data: {
    invoice?: Record<string, unknown>;
    payments?: AggregateSalePayment[];
  }) {
    if (data.invoice) {
      const inc = data.invoice;
      setInvoice((prev) => ({
        ...prev,
        status: String(inc.status ?? prev.status),
        saleKey: "saleKey" in inc ? (inc.saleKey as string | null) : prev.saleKey,
        orderReference:
          "orderReference" in inc ? (inc.orderReference as string | null) : prev.orderReference,
        centralState:
          "centralState" in inc ? (inc.centralState as string | null) : prev.centralState,
        centralTotal:
          inc.centralTotal != null ? Number(inc.centralTotal) : prev.centralTotal,
        centralRestPayable:
          inc.centralRestPayable != null
            ? Number(inc.centralRestPayable)
            : prev.centralRestPayable,
      }));
      onUpdated?.({ invoice: inc, payments: data.payments });
    }
  }

  function handlePublish() {
    if (!canPublish || pending) return;
    const docLabel =
      invoice.orderReference && !invoice.orderReference.startsWith("HOT-INV-")
        ? invoice.orderReference
        : invoice.saleKey ?? "actual";
    if (
      !window.confirm(
        `Publicar o documento ${docLabel} no sistema central como Fatura fiscal definitiva (FT)? Após publicação, não será possível acrescentar linhas.`,
      )
    ) {
      return;
    }
    setError(null);
    setWarning(null);
    setMessage(null);
    if (!publishKeyRef.current) {
      publishKeyRef.current = makeIdempotencyKey(`publish-${invoice.id}`);
    }
    const idempotencyKey = publishKeyRef.current;

    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${invoice.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "receipt",
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao publicar fatura no sistema central");
        applyLocalUpdate(data);
        router.refresh();
        return;
      }
      applyLocalUpdate(data);
      if (data.reconciliationRequired) {
        setWarning(
          data.warning ??
            "Publicação sem confirmação final do sistema central. Actualize o estado central antes de repetir.",
        );
      } else {
        publishKeyRef.current = null;
        const docNum = data.documentNumber ?? data.invoice?.orderReference;
        setMessage(
          `Fatura publicada no sistema central${docNum ? ` (${docNum})` : ""}. Já pode registar pagamentos abaixo.`,
        );
        setShowPayForm(true);
      }
      router.refresh();
    });
  }

  function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay || pending) return;
    setError(null);
    setWarning(null);
    setMessage(null);

    const numericAmount = Number(amount);
    const numericMethodId = Number(paymentMethodId);
    const numericBankId = bankAccountId ? Number(bankAccountId) : undefined;

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Indique um valor de pagamento superior a zero.");
      return;
    }
    if (numericAmount > remaining + 0.005) {
      setError(
        `O valor (${formatMoney(numericAmount, invoice.currency)}) excede o saldo em dívida (${formatMoney(remaining, invoice.currency)}).`,
      );
      return;
    }
    if (!Number.isInteger(numericMethodId) || numericMethodId < 1) {
      setError("Seleccione um método de pagamento válido do sistema central.");
      return;
    }

    const payloadSig = JSON.stringify({
      invoiceId: invoice.id,
      amount: Number(numericAmount.toFixed(2)),
      paymentMethodId: numericMethodId,
      bankAccountId: numericBankId ?? null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    });
    if (!paymentKeyRef.current || paymentKeyRef.current.signature !== payloadSig) {
      paymentKeyRef.current = {
        signature: payloadSig,
        key: makeIdempotencyKey(`pay-${invoice.id}`),
      };
    }
    const idempotencyKey = paymentKeyRef.current.key;

    startTransition(async () => {
      const res = await fetch(`/api/v1/integrations/sigesc/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(numericAmount.toFixed(2)),
          paymentMethodId: numericMethodId,
          ...(numericBankId ? { bankAccountId: numericBankId } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao registar pagamento no sistema central");
        applyLocalUpdate(data);
        router.refresh();
        return;
      }
      applyLocalUpdate(data);
      if (data.reconciliationRequired) {
        setWarning(
          data.warning ??
            "Pagamento enviado sem confirmação final do sistema central (timeout/rede). Actualize o estado ou tente novamente com a mesma chave.",
        );
      } else {
        paymentKeyRef.current = null;
        setReference("");
        setNotes("");
        const receipt = data.payment?.number ? ` · Recibo ${data.payment.number}` : "";
        const nextRest =
          data.invoice?.centralRestPayable != null
            ? Number(data.invoice.centralRestPayable)
            : null;
        setMessage(
          data.idempotent
            ? `Pagamento já registado no sistema central (idempotente${receipt}).`
            : `Pagamento confirmado no sistema central${receipt}. Por liquidar: ${formatMoney(nextRest, invoice.currency)}.`,
        );
      }
      router.refresh();
    });
  }

  if (!canSettle || !isSubmitted) {
    return null;
  }

  if (isPaid) {
    return compact ? (
      <p className="font-ui mt-1 text-xs font-medium text-teal-800">
        Fatura liquidada integralmente no sistema central ({invoice.orderReference ?? invoice.saleKey}).
      </p>
    ) : (
      <div className="surface border-l-4 border-l-teal-600 p-4">
        <p className="font-ui text-sm font-medium text-teal-900">
          Fatura totalmente liquidada no sistema central
          {invoice.orderReference ? ` (${invoice.orderReference})` : ""}. Saldo por liquidar: 0,00{" "}
          {invoice.currency}.
        </p>
      </div>
    );
  }

  if (isCancelled) {
    return compact ? null : (
      <div className="surface-muted p-4">
        <p className="font-ui text-sm text-stone-600">
          Documento anulado no sistema central ({invoice.centralState}) — publicação e pagamentos bloqueados.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "mt-2 space-y-2 rounded-md border border-sand-200 bg-sand-50/50 p-3" : "surface p-5 space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={compact ? "text-xs font-semibold uppercase tracking-wide text-ink-900" : "text-lg font-semibold text-ink-900"}>
            {canPublish ? "Publicação fiscal no sistema central" : "Liquidação / Pagamento no sistema central"}
          </h3>
          {!compact ? (
            <p className="font-ui mt-1 text-xs text-stone-500">
              {canPublish
                ? "Converte a Cotação/Proforma numa Fatura oficial (FT) com numeração sequencial e hash SAF-T-AO no sistema central."
                : `Saldo actual por liquidar no sistema central: ${formatMoney(remaining, invoice.currency)}. Suporta pagamento total ou parcial com protecção idempotente anti-duplicação.`}
            </p>
          ) : (
            <p className="font-ui text-xs text-stone-500">
              {canPublish
                ? `Estado: ${invoice.centralState} · Total: ${formatMoney(invoice.centralTotal, invoice.currency)}`
                : `${invoice.orderReference ?? invoice.saleKey} · Por liquidar: ${formatMoney(remaining, invoice.currency)}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {canPublish ? (
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              disabled={pending}
              onClick={handlePublish}
            >
              {pending ? "A publicar…" : "Publicar fatura (FT)"}
            </Button>
          ) : null}

          {canPay && compact ? (
            <Button
              type="button"
              size="sm"
              variant={showPayForm ? "secondary" : "default"}
              disabled={pending}
              onClick={() => {
                const next = !showPayForm;
                setShowPayForm(next);
                if (next && !methodsLoaded) void loadPaymentMethods();
              }}
            >
              {showPayForm ? "Fechar pagamento" : "Liquidar fatura"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="font-ui rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="font-ui rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {warning}
        </p>
      ) : null}
      {message ? (
        <p className="font-ui rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
          {message}
        </p>
      ) : null}

      {canPay && showPayForm ? (
        <form onSubmit={handlePayment} className="font-ui space-y-3 border-t border-sand-200 pt-3 text-sm">
          {methodsError ? (
            <div className="flex items-center justify-between gap-2 text-xs text-red-700">
              <span>{methodsError}</span>
              <button
                type="button"
                className="underline"
                onClick={() => void loadPaymentMethods()}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
            <label className="block">
              <span className="text-xs text-stone-500">Método de pagamento *</span>
              <select
                required
                value={paymentMethodId}
                onChange={(e) => {
                  const val = e.target.value;
                  setPaymentMethodId(val);
                  const found = methods.find((m) => String(m.id) === val);
                  if (found?.default_bank_account_id) {
                    setBankAccountId(String(found.default_bank_account_id));
                  }
                }}
                className="mt-1 h-9 w-full rounded-md border border-sand-200 bg-white px-2.5 text-sm"
              >
                <option value="">
                  {methodsLoaded ? "Seleccionar método…" : "A carregar métodos…"}
                </option>
                {methods.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                    {m.is_cash ? " (Numerário)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-stone-500">Valor ({invoice.currency}) *</span>
              <div className="mt-1 flex gap-1">
                <input
                  type="number"
                  required
                  min="0.01"
                  max={Number(remaining.toFixed(2))}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 w-full rounded-md border border-sand-200 bg-white px-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setAmount(remaining.toFixed(2))}
                  className="shrink-0 rounded-md border border-sand-200 bg-white px-2 text-xs text-stone-600 hover:bg-sand-50"
                  title="Preencher valor total em dívida"
                >
                  Total
                </button>
              </div>
            </label>

            {accounts.length > 0 ? (
              <label className="block">
                <span className="text-xs text-stone-500">Caixa / Conta bancária</span>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-sand-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Automático (padrão Sistema Central)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={String(acc.id)}>
                      {acc.name}
                      {acc.is_cash ? " (Caixa)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Referência / comprovativo (opcional)"
              maxLength={128}
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5 text-sm"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações (opcional)"
              maxLength={500}
              className="h-9 rounded-md border border-sand-200 bg-white px-2.5 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">
              Protecção idempotente activa · não permite duplo pagamento em retries.
            </span>
            <Button
              type="submit"
              size={compact ? "sm" : "default"}
              disabled={pending || !paymentMethodId || remaining <= 0.004}
            >
              {pending ? "A liquidar…" : "Registar pagamento"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
