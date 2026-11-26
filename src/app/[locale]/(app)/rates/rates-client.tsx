"use client";

import { useMemo, useState, useTransition } from "react";
import { Calculator, CalendarRange, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";
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
  const singleHotelId = hotels.length === 1 ? (hotels[0]?.value ?? "") : "";
  const [plans, setPlans] = useState(initialPlans);
  const [hotelId, setHotelId] = useState(singleHotelId);
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Independent FormDrawer states
  const [createOpen, setCreateOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [seasonalPlan, setSeasonalPlan] = useState<Plan | null>(null);

  const [form, setForm] = useState({
    hotelId: singleHotelId,
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
    hotelId: singleHotelId,
    categoryId: "",
    arrivalDate: "",
    departureDate: "",
    occupants: "2",
  });

  const filteredCategories = useMemo(
    () => categories.filter((c) => !form.hotelId || c.hotelId === form.hotelId),
    [categories, form.hotelId],
  );

  const quoteCategories = useMemo(
    () => categories.filter((c) => !quoteForm.hotelId || c.hotelId === quoteForm.hotelId),
    [categories, quoteForm.hotelId],
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

  function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const targetHotelId = form.hotelId || singleHotelId;
      const res = await fetch("/api/v1/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: targetHotelId,
          categoryId: form.categoryId,
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          baseAmount: Number(form.baseAmount),
          priority: Number(form.priority) || 0,
          minStayNights: Number(form.minStayNights) || 1,
          includedOccupancy: Number(form.includedOccupancy) || 2,
          extraGuestAmount: form.extraGuestAmount ? Number(form.extraGuestAmount) : null,
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
      setCreateOpen(false);
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

  function addSeasonal(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonalPlan) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/rates/${seasonalPlan.id}`, {
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
      setSeasonalPlan(null);
      refresh();
    });
  }

  function runQuote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setQuote(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/rates/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: quoteForm.hotelId || singleHotelId,
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
    <div className="space-y-6">
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Planos Tarifários</h2>
            <p className="font-ui mt-0.5 max-w-2xl text-sm text-stone-500">
              Tarifas operacionais de alojamento, épocas sazonais e simulador de preço por estadia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuoteOpen(true)}
              className="gap-1.5"
            >
              <Calculator className="h-4 w-4" />
              Simular preço
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nova tarifa
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {hotels.length > 1 ? (
            <SearchableSelect
              className="w-full sm:w-52"
              options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
              value={hotelId}
              onChange={setHotelId}
              clearable={false}
            />
          ) : null}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar código / nome…"
            className="h-10 w-full rounded-md border border-sand-200 bg-white px-3 text-sm sm:w-64"
          />
          <label className="font-ui flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            Só activas
          </label>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={refresh}>
            Filtrar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {message}
        </div>
      ) : null}

      {/* Full-width independent list of rate plans */}
      {plans.length === 0 ? (
        <EmptyState title="Sem tarifas" description="Crie o primeiro plano tarifário." />
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li key={p.id} className="surface-interactive p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-900">
                    {p.name}{" "}
                    <span className="font-mono text-xs text-stone-500">({p.code})</span>
                  </p>
                  <p className="font-ui mt-1 text-xs text-stone-500">
                    {hotels.length > 1 ? `${p.hotel.name} · ` : ""}
                    {p.category.name} · base{" "}
                    <strong className="text-ink-900">
                      {Number(p.baseAmount).toFixed(2)} {p.currency}/noite
                    </strong>{" "}
                    · prioridade {p.priority}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusPill value={p.active ? "ACTIVE" : "INACTIVE"} />
                    {p.weekendOnly ? <StatusPill value="WEEKEND" /> : null}
                    {p.weekdayOnly ? <StatusPill value="WEEKDAY" /> : null}
                  </div>
                  {p.seasonals.length > 0 ? (
                    <ul className="font-ui mt-2.5 space-y-1 text-xs text-stone-500">
                      {p.seasonals.map((s) => (
                        <li key={s.id}>
                          <span className="font-medium text-ink-900">{s.name}:</span>{" "}
                          {String(s.startDate).slice(0, 10)} → {String(s.endDate).slice(0, 10)} ·{" "}
                          {Number(s.amount).toFixed(2)} {p.currency}
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
                    onClick={() => setSeasonalPlan(p)}
                    className="gap-1"
                  >
                    <CalendarRange className="h-3.5 w-3.5" />
                    Nova época
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Independent Create Rate Plan Drawer */}
      <FormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        eyebrow="Tarifário"
        title="Novo plano tarifário"
        subtitle="Defina categoria, preço base por noite, restrições de estadia e dias da semana."
        size="lg"
        onSubmit={createPlan}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                !(form.hotelId || singleHotelId) ||
                !form.categoryId ||
                !form.name ||
                !form.code ||
                form.baseAmount === ""
              }
            >
              {pending ? "A criar…" : "Criar tarifa"}
            </Button>
          </div>
        }
      >
        <div className="surface space-y-4 p-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {hotels.length > 1 ? (
              <div className="block sm:col-span-2">
                <span className="text-stone-600">Hotel *</span>
                <SearchableSelect
                  className="mt-1"
                  options={hotels}
                  value={form.hotelId}
                  onChange={(v) => setForm((f) => ({ ...f, hotelId: v, categoryId: "" }))}
                  labels={{ placeholder: "Seleccionar hotel" }}
                />
              </div>
            ) : null}
            <div className="block sm:col-span-2">
              <span className="text-stone-600">Categoria de quarto *</span>
              <SearchableSelect
                className="mt-1"
                options={filteredCategories}
                value={form.categoryId}
                onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                labels={{ placeholder: "Seleccionar categoria" }}
              />
            </div>
            <label className="block">
              <span className="text-stone-600">Nome do plano *</span>
              <input
                required
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                placeholder="Ex.: Tarifa Standard Flexível"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Código *</span>
              <input
                required
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                placeholder="Ex.: STD-FLEX"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Preço base / noite *</span>
              <input
                required
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                type="number"
                min={0}
                step="0.01"
                value={form.baseAmount}
                onChange={(e) => setForm((f) => ({ ...f, baseAmount: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Prioridade</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Válida de</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Válida até</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Estadia mínima (noites)</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                type="number"
                min={1}
                value={form.minStayNights}
                onChange={(e) => setForm((f) => ({ ...f, minStayNights: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Ocupação incluída</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                type="number"
                min={1}
                value={form.includedOccupancy}
                onChange={(e) => setForm((f) => ({ ...f, includedOccupancy: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-stone-600">Valor hóspede extra (por noite)</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                type="number"
                min={0}
                step="0.01"
                value={form.extraGuestAmount}
                onChange={(e) => setForm((f) => ({ ...f, extraGuestAmount: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 pt-1 text-sm text-stone-700">
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
                className="h-4 w-4 accent-teal-600"
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
                className="h-4 w-4 accent-teal-600"
              />
              Só dias úteis
            </label>
          </div>
        </div>
      </FormDrawer>

      {/* Independent Seasonal Override Drawer */}
      <FormDrawer
        open={Boolean(seasonalPlan)}
        onClose={() => setSeasonalPlan(null)}
        eyebrow={seasonalPlan?.code}
        title={`Adicionar época — ${seasonalPlan?.name ?? ""}`}
        size="md"
        onSubmit={addSeasonal}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSeasonalPlan(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A guardar…" : "Adicionar época"}
            </Button>
          </div>
        }
      >
        <div className="surface space-y-4 p-4 text-sm">
          <label className="block">
            <span className="text-stone-600">Nome da época *</span>
            <input
              required
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              placeholder="Ex.: Época Alta Dezembro"
              value={seasonal.name}
              onChange={(e) => setSeasonal((s) => ({ ...s, name: e.target.value }))}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-stone-600">Início *</span>
              <input
                required
                type="date"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                value={seasonal.startDate}
                onChange={(e) => setSeasonal((s) => ({ ...s, startDate: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Fim *</span>
              <input
                required
                type="date"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                value={seasonal.endDate}
                onChange={(e) => setSeasonal((s) => ({ ...s, endDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-stone-600">Valor por noite *</span>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
              value={seasonal.amount}
              onChange={(e) => setSeasonal((s) => ({ ...s, amount: e.target.value }))}
            />
          </label>
        </div>
      </FormDrawer>

      {/* Independent Quote Simulator Drawer */}
      <FormDrawer
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        eyebrow="Simulador"
        title="Simular preço de estadia"
        subtitle="Prioridade mais alta ganha; épocas sobrepõem a base; ocupação extra soma automaticamente."
        size="md"
        onSubmit={runQuote}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setQuoteOpen(false)}>
              Fechar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A calcular…" : "Calcular"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="surface space-y-3 p-4">
            {hotels.length > 1 ? (
              <div className="block">
                <span className="text-stone-600">Hotel *</span>
                <SearchableSelect
                  className="mt-1"
                  options={hotels}
                  value={quoteForm.hotelId}
                  onChange={(v) => setQuoteForm((f) => ({ ...f, hotelId: v, categoryId: "" }))}
                  labels={{ placeholder: "Hotel" }}
                />
              </div>
            ) : null}
            <div className="block">
              <span className="text-stone-600">Categoria *</span>
              <SearchableSelect
                className="mt-1"
                options={quoteCategories}
                value={quoteForm.categoryId}
                onChange={(v) => setQuoteForm((f) => ({ ...f, categoryId: v }))}
                labels={{ placeholder: "Categoria" }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Entrada *</span>
                <input
                  required
                  type="date"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  value={quoteForm.arrivalDate}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, arrivalDate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Saída *</span>
                <input
                  required
                  type="date"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                  value={quoteForm.departureDate}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, departureDate: e.target.value }))}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-stone-600">Ocupantes</span>
              <input
                type="number"
                min={1}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
                value={quoteForm.occupants}
                onChange={(e) => setQuoteForm((f) => ({ ...f, occupants: e.target.value }))}
              />
            </label>
          </div>

          {quote ? (
            <div className="surface p-4 text-sm text-stone-700">
              <p className="text-base font-semibold text-ink-900">
                Subtotal: {quote.subtotal.toFixed(2)} {quote.currency}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {quote.nights.map((n) => (
                  <li key={n.date} className="flex justify-between gap-2 border-b border-sand-100 pb-1">
                    <span className="font-mono text-stone-600">{n.date}</span>
                    <span>
                      <strong>{n.amount.toFixed(2)}</strong> · {n.ratePlanCode} ({n.reason})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </FormDrawer>
    </div>
  );
}
