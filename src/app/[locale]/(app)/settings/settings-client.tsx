"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type HotelRow = {
  id: string;
  name: string;
  code: string;
  settings: {
    checkInTime: string;
    checkOutTime: string;
    timezone: string;
    currency: string;
    locale: string;
    maxStayNights: number | null;
    allowChildren: boolean;
  } | null;
};

type Settings = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  street: string | null;
  timezone: string;
  currency: string;
  locale: string;
  sigescCompanyRef: string | null;
  aggregateConnection: {
    host: string;
    keyPrefix: string;
    status: string;
    lastError: string | null;
  } | null;
  hotels: HotelRow[];
};

export function SettingsClient({
  initial,
  readOnly,
}: {
  initial: Settings;
  readOnly: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [inst, setInst] = useState({
    name: settings.name,
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    city: settings.city ?? "",
    country: settings.country ?? "",
    street: settings.street ?? "",
    timezone: settings.timezone,
    currency: settings.currency,
    locale: settings.locale,
  });

  function saveInstitution() {
    if (readOnly) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateInstitution",
          name: inst.name,
          email: inst.email || null,
          phone: inst.phone || null,
          city: inst.city || null,
          country: inst.country || null,
          street: inst.street || null,
          timezone: inst.timezone,
          currency: inst.currency,
          locale: inst.locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha");
        return;
      }
      setMessage("Instituição actualizada");
      setSettings((s) => ({ ...s, ...data.institution }));
    });
  }

  function saveHotel(hotel: HotelRow, patch: Record<string, unknown>) {
    if (readOnly) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateHotelSettings",
          hotelId: hotel.id,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha");
        return;
      }
      setMessage(`Definições de ${hotel.name} guardadas`);
      setSettings((s) => ({
        ...s,
        hotels: s.hotels.map((h) =>
          h.id === hotel.id ? { ...h, settings: data.settings } : h,
        ),
      }));
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900">Configurações</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
          Perfil da instituição e horários por hotel. Credenciais Aggregate não são editáveis
          aqui — use a integração SIGESC.
        </p>
      </div>

      {readOnly ? (
        <p className="font-ui text-sm text-amber-800">
          Vista apenas de leitura — requer permissão settings.write para alterar.
        </p>
      ) : null}
      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}
      {message ? <p className="font-ui text-sm text-teal-800">{message}</p> : null}

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg font-medium">Instituição</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Nome"],
              ["email", "Email"],
              ["phone", "Telefone"],
              ["street", "Rua"],
              ["city", "Cidade"],
              ["country", "País"],
              ["timezone", "Fuso"],
              ["currency", "Moeda"],
              ["locale", "Locale"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="font-ui block text-xs text-stone-500">
              {label}
              <input
                className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3 text-sm"
                value={inst[key]}
                disabled={readOnly || pending}
                onChange={(e) => setInst((s) => ({ ...s, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {settings.sigescCompanyRef ? (
          <p className="font-ui text-xs text-stone-400">
            SIGESC company ref: {settings.sigescCompanyRef}
          </p>
        ) : null}
        {!readOnly ? (
          <Button type="button" disabled={pending} onClick={saveInstitution}>
            Guardar instituição
          </Button>
        ) : null}
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg font-medium">Ligação Aggregate</h2>
        {settings.aggregateConnection ? (
          <div className="font-ui text-sm text-stone-600">
            <p>
              {settings.aggregateConnection.host} · {settings.aggregateConnection.keyPrefix}… ·{" "}
              {settings.aggregateConnection.status}
            </p>
            {settings.aggregateConnection.lastError ? (
              <p className="mt-1 text-danger">{settings.aggregateConnection.lastError}</p>
            ) : null}
          </div>
        ) : (
          <p className="font-ui text-sm text-stone-500">Sem ligação Aggregate configurada.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Hotéis</h2>
        {settings.hotels.map((hotel) => (
          <HotelSettingsCard
            key={hotel.id}
            hotel={hotel}
            readOnly={readOnly}
            pending={pending}
            onSave={saveHotel}
          />
        ))}
      </section>
    </div>
  );
}

function HotelSettingsCard({
  hotel,
  readOnly,
  pending,
  onSave,
}: {
  hotel: HotelRow;
  readOnly: boolean;
  pending: boolean;
  onSave: (hotel: HotelRow, patch: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    checkInTime: hotel.settings?.checkInTime ?? "14:00",
    checkOutTime: hotel.settings?.checkOutTime ?? "12:00",
    timezone: hotel.settings?.timezone ?? "Africa/Luanda",
    currency: hotel.settings?.currency ?? "AOA",
    locale: hotel.settings?.locale ?? "pt",
    maxStayNights: hotel.settings?.maxStayNights?.toString() ?? "",
    allowChildren: hotel.settings?.allowChildren ?? true,
  });

  return (
    <div className="surface space-y-3 p-5">
      <p className="font-medium text-ink-900">
        {hotel.name}{" "}
        <span className="font-ui text-sm text-stone-500">({hotel.code})</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="font-ui text-xs text-stone-500">
          Check-in
          <input
            className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3 text-sm"
            value={form.checkInTime}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, checkInTime: e.target.value }))}
          />
        </label>
        <label className="font-ui text-xs text-stone-500">
          Check-out
          <input
            className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3 text-sm"
            value={form.checkOutTime}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, checkOutTime: e.target.value }))}
          />
        </label>
        <label className="font-ui text-xs text-stone-500">
          Estadia máx. (noites)
          <input
            type="number"
            min={1}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 px-3 text-sm"
            value={form.maxStayNights}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, maxStayNights: e.target.value }))}
          />
        </label>
      </div>
      <label className="font-ui flex items-center gap-2 text-sm text-stone-600">
        <input
          type="checkbox"
          checked={form.allowChildren}
          disabled={readOnly}
          onChange={(e) => setForm((f) => ({ ...f, allowChildren: e.target.checked }))}
        />
        Permitir crianças
      </label>
      {!readOnly ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            onSave(hotel, {
              checkInTime: form.checkInTime,
              checkOutTime: form.checkOutTime,
              timezone: form.timezone,
              currency: form.currency,
              locale: form.locale,
              maxStayNights: form.maxStayNights ? Number(form.maxStayNights) : null,
              allowChildren: form.allowChildren,
            })
          }
        >
          Guardar hotel
        </Button>
      ) : null}
    </div>
  );
}
