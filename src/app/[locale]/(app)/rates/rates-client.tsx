"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Seasonal = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  amount: string | number;
  weekendOnly: boolean;
  weekdayOnly: boolean;
};

type Plan = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  baseAmount: string | number;
  currency: string;
  active: boolean;
  priority: number;
  weekdayOnly: boolean;
  weekendOnly: boolean;
  validFrom: string | null;
  validTo: string | null;
  minStayNights: number;
  maxStayNights: number | null;
  includedOccupancy: number;
  extraGuestAmount: string | number | null;
  hotel: { id: string; name: string };
  category: { id: string; name: string; code: string };
  seasonals: Seasonal[];
};

type QuoteNight = {
  date: string;
  amount: number;
  ratePlanCode: string;
  source: string;
  reason: string;
};

export function RatesClient({
  initialPlans,
  hotels,
  categories,
}: {
  initialPlans: Plan[];
  hotels: SearchableOption[];
  categories: Array<SearchableOption & { hotelId: string }>;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [hotelId, setHotelId] = useState("");
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    hotelId: "",
    categoryId: "",
    name: "",
    code: "",
    description: "",
    baseAmount: "",
    priority: "0",
    minStayNights: "1",
    includedOccupancy: "2",
    extraGuestAmount: "",
    validFrom: "",
    validTo: "",
    weekendOnly: false,
    weekdayOnly: false,
  });

  const [seasonal, setSeasonal] = useState({
    name: "",
    startDate: "",
    endDate: "",
    amount: "",
    weekendOnly: false,
  });

  const [quote, setQuote] = useState<{
    subtotal: number;
    currency: string;
    nights: QuoteNight[];
  } | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    hotelId: "",
    categoryId: "",
    arrivalDate: "",
    departureDate: "",
    occupants: "2",
  });

  const filteredCategories = useMemo(
    () =>
      categories.filter((c) => !form.hotelId || c.hotelId === form.hotelId),
    [categories, form.hotelId],
  );

  function refresh() {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (hotelId) params.set("hotelId", hotelId);
      if (q.trim()) params.set("q", q.trim());
      if (activeOnly) params.set("active", "1");
      const res = await fetch(`/api/v1/rates?${params}`);
      const data = await res.json();
      if (res.ok) setPlans(JSON.parse(JSON.stringify(data.rows ?? [])));
    });
  }

  function createPlan() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: form.hotelId,
          categoryId: form.categoryId,
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          baseAmount: Number(form.baseAmount),
          priority: Number(form.priority) || 0,
          minStayNights: Number(form.minStayNights) || 1,
          includedOccupancy: Number(form.includedOccupancy) || 2,
          extraGuestAmount: form.extraGuestAmount
            ? Number(form.extraGuestAmount)
            : null,
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
          weekendOnly: form.weekendOnly,
          weekdayOnly: form.weekdayOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar tarifa");
        return;
      }
      setMessage(`Tarifa ${data.plan.code} criada`);
      setForm((f) => ({ ...f, name: "", code: "", description: "", baseAmount: "" }));
      refresh();
    });
  }

  function toggleActive(plan: Plan) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/rates/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !plan.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha");
        return;
      }
      setMessage(plan.active ? "Tarifa desactivada" : "Tarifa activada");
      refresh();
    });
  }

  function addSeasonal(planId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/rates/${planId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addSeasonal",
          name: seasonal.name,
          startDate: seasonal.startDate,
          endDate: seasonal.endDate,
          amount: Number(seasonal.amount),
          weekendOnly: seasonal.weekendOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sobreposição ou dados inválidos");
        return;
      }
      setMessage("Época adicionada");
      setSeasonal({ name: "", startDate: "", endDate: "", amount: "", weekendOnly: false });
      refresh();
    });
  }

  function runQuote() {
    setError(null);
    setQuote(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/rates/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: quoteForm.hotelId,
          categoryId: quoteForm.categoryId,
          arrivalDate: quoteForm.arrivalDate,
          departureDate: quoteForm.departureDate,
          occupants: Number(quoteForm.occupants) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sem tarifa aplicável");
        return;
      }
      setQuote(data.quote);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink-900">Tarifas</h1>
          <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
            Planos tarifários operacionais de alojamento. Preços Sistema Central de produtos comerciais
            permanecem sob autoridade central — estas tarifas não são documentos fiscais.
          </p>
        </div>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <SearchableSelect
          className="w-52"
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={setHotelId}
          clearable={false}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar código / nome…"
          className="h-10 w-56 rounded-md border border-sand-200 bg-white px-3 text-sm"
        />
        <label className="font-ui flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Só activas
        </label>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={refresh}>
          Filtrar
        </Button>
      </div>

      <section className="surface space-y-3 p-4">
        <h2 className="text-lg font-medium text-ink-900">Nova tarifa</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SearchableSelect
            options={hotels}
            value={form.hotelId}
            onChange={(v) => setForm((f) => ({ ...f, hotelId: v, categoryId: "" }))}
            labels={{ placeholder: "Hotel" }}
          />
          <SearchableSelect
            options={filteredCategories}
            value={form.categoryId}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            labels={{ placeholder: "Categoria" }}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Código"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Preço base / noite"
            type="number"
            min={0}
            step="0.01"
            value={form.baseAmount}
            onChange={(e) => setForm((f) => ({ ...f, baseAmount: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Prioridade"
            type="number"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            type="date"
            value={form.validTo}
            onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Estadia mín."
            type="number"
            min={1}
            value={form.minStayNights}
            onChange={(e) => setForm((f) => ({ ...f, minStayNights: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Ocupação incluída"
            type="number"
            min={1}
            value={form.includedOccupancy}
            onChange={(e) => setForm((f) => ({ ...f, includedOccupancy: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            placeholder="Extra hóspede"
            type="number"
            min={0}
            step="0.01"
            value={form.extraGuestAmount}
            onChange={(e) => setForm((f) => ({ ...f, extraGuestAmount: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-stone-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.weekendOnly}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  weekendOnly: e.target.checked,
                  weekdayOnly: e.target.checked ? false : f.weekdayOnly,
                }))
              }
            />
            Só fim-de-semana
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.weekdayOnly}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  weekdayOnly: e.target.checked,
                  weekendOnly: e.target.checked ? false : f.weekendOnly,
                }))
              }
            />
            Só dias úteis
          </label>
        </div>
        <Button
          type="button"
          disabled={
            pending ||
            !form.hotelId ||
            !form.categoryId ||
            !form.name ||
            !form.code ||
            form.baseAmount === ""
          }
          onClick={createPlan}
        >
          Criar tarifa
        </Button>
      </section>

      {plans.length === 0 ? (
        <EmptyState title="Sem tarifas" description="Crie o primeiro plano tarifário." />
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li key={p.id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {p.name}{" "}
                    <span className="font-ui text-sm text-stone-500">({p.code})</span>
                  </p>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {p.hotel.name} · {p.category.name} · base {Number(p.baseAmount).toFixed(2)}{" "}
                    {p.currency}/noite · prioridade {p.priority}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusPill value={p.active ? "ACTIVE" : "INACTIVE"} />
                    {p.weekendOnly ? <StatusPill value="WEEKEND" /> : null}
                    {p.weekdayOnly ? <StatusPill value="WEEKDAY" /> : null}
                  </div>
                  {p.seasonals.length > 0 ? (
                    <ul className="font-ui mt-2 space-y-1 text-xs text-stone-500">
                      {p.seasonals.map((s) => (
                        <li key={s.id}>
                          {s.name}: {String(s.startDate).slice(0, 10)} →{" "}
                          {String(s.endDate).slice(0, 10)} · {Number(s.amount).toFixed(2)}{" "}
                          {p.currency}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => toggleActive(p)}
                  >
                    {p.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  >
                    Época
                  </Button>
                </div>
              </div>
              {selectedId === p.id ? (
                <div className="mt-3 grid gap-2 border-t border-sand-200 pt-3 sm:grid-cols-4">
                  <input
                    className="h-9 rounded-md border border-sand-200 px-2 text-sm"
                    placeholder="Nome época"
                    value={seasonal.name}
                    onChange={(e) => setSeasonal((s) => ({ ...s, name: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="h-9 rounded-md border border-sand-200 px-2 text-sm"
                    value={seasonal.startDate}
                    onChange={(e) => setSeasonal((s) => ({ ...s, startDate: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="h-9 rounded-md border border-sand-200 px-2 text-sm"
                    value={seasonal.endDate}
                    onChange={(e) => setSeasonal((s) => ({ ...s, endDate: e.target.value }))}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-9 rounded-md border border-sand-200 px-2 text-sm"
                    placeholder="Valor"
                    value={seasonal.amount}
                    onChange={(e) => setSeasonal((s) => ({ ...s, amount: e.target.value }))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => addSeasonal(p.id)}
                  >
                    Adicionar época
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <section className="surface space-y-3 p-4">
        <h2 className="text-lg font-medium text-ink-900">Simular preço (servidor)</h2>
        <p className="font-ui text-xs text-stone-500">
          Prioridade mais alta ganha; épocas sobrepõem a base; extras além da ocupação incluída
          adicionam o valor de hóspede extra.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SearchableSelect
            options={hotels}
            value={quoteForm.hotelId}
            onChange={(v) => setQuoteForm((f) => ({ ...f, hotelId: v, categoryId: "" }))}
            labels={{ placeholder: "Hotel" }}
          />
          <SearchableSelect
            options={categories.filter(
              (c) => !quoteForm.hotelId || c.hotelId === quoteForm.hotelId,
            )}
            value={quoteForm.categoryId}
            onChange={(v) => setQuoteForm((f) => ({ ...f, categoryId: v }))}
            labels={{ placeholder: "Categoria" }}
          />
          <input
            type="date"
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            value={quoteForm.arrivalDate}
            onChange={(e) => setQuoteForm((f) => ({ ...f, arrivalDate: e.target.value }))}
          />
          <input
            type="date"
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            value={quoteForm.departureDate}
            onChange={(e) => setQuoteForm((f) => ({ ...f, departureDate: e.target.value }))}
          />
          <input
            type="number"
            min={1}
            className="h-10 rounded-md border border-sand-200 px-3 text-sm"
            value={quoteForm.occupants}
            onChange={(e) => setQuoteForm((f) => ({ ...f, occupants: e.target.value }))}
          />
        </div>
        <Button type="button" disabled={pending} onClick={runQuote}>
          Calcular
        </Button>
        {quote ? (
          <div className="font-ui text-sm text-stone-700">
            <p className="font-medium">
              Subtotal {quote.subtotal.toFixed(2)} {quote.currency}
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {quote.nights.map((n) => (
                <li key={n.date}>
                  {n.date}: {n.amount.toFixed(2)} · {n.ratePlanCode} · {n.source} — {n.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
