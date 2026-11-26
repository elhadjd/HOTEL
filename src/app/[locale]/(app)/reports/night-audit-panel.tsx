"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AuditRun = {
  id: string;
  businessDate: string;
  hotel: { id: string; name: string; code: string };
  totalRooms: number;
  sellableRooms: number;
  occupiedRooms: number;
  occupancyPercent: number | string;
  accommodationRevenue: number | string;
  extrasRevenue: number | string;
  adr: number | string;
  revpar: number | string;
  noShowsMarked: number;
  staysAudited: number;
  reconciliationAlerts: number;
  currency: string;
};

function money(v: number | string, currency = "AOA") {
  return `${Number(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function NightAuditPanel({
  hotels,
  initialRuns,
}: {
  hotels: Array<{ value: string; label: string }>;
  initialRuns: AuditRun[];
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [hotelId, setHotelId] = useState(hotels[0]?.value ?? "");
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [markNoShows, setMarkNoShows] = useState(true);
  const [forceRecalculate, setForceRecalculate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function executeAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/night-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          businessDate,
          markNoShows,
          forceRecalculate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao executar Night Audit");
        return;
      }
      setMessage(
        data.alreadyExisted
          ? `Fecho diário para ${businessDate} já estava registado (active "Recalcular" se precisar actualizar).`
          : `Night Audit concluído para ${businessDate}: ocupação ${Number(data.run.occupancyPercent)}%, ADR ${money(data.run.adr, data.run.currency)}, RevPAR ${money(data.run.revpar, data.run.currency)}, ${data.run.noShowsMarked} no-show(s).`,
      );
      const listRes = await fetch("/api/v1/night-audit?limit=20");
      const listData = await listRes.json().catch(() => ({}));
      if (listRes.ok && Array.isArray(listData.runs)) {
        setRuns(listData.runs);
      }
      router.refresh();
    });
  }

  return (
    <section className="surface mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink-900">
            Fecho Diário (Night Audit) · ADR & RevPAR Históricos
          </h2>
          <p className="font-ui mt-1 max-w-2xl text-xs text-stone-500">
            Marca automaticamente reservas não comparecidas como <code>NO_SHOW</code>, sincroniza
            diárias das estadias activas, regista o snapshot histórico de ocupação/ADR/RevPAR e
            alerta faturas pendentes de reconciliação no sistema central.
          </p>
        </div>
      </div>

      <form
        onSubmit={executeAudit}
        className="font-ui mt-4 grid gap-3 rounded-lg border border-sand-200 bg-sand-50/60 p-4 text-sm md:grid-cols-4"
      >
        <label className="block">
          <span className="text-xs text-stone-500">Hotel</span>
          <select
            value={hotelId}
            onChange={(e) => setHotelId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          >
            {hotels.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Data de negócio</span>
          <input
            type="date"
            required
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <div className="flex flex-col justify-center gap-1.5 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={markNoShows}
              onChange={(e) => setMarkNoShows(e.target.checked)}
            />
            Marcar reservas em atraso como NO_SHOW
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={forceRecalculate}
              onChange={(e) => setForceRecalculate(e.target.checked)}
            />
            Recalcular se já existir fecho nesta data
          </label>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending || !hotelId} className="w-full">
            {pending ? "A executar…" : "Executar Night Audit"}
          </Button>
        </div>
      </form>

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

      <div className="mt-4 overflow-x-auto">
        {runs.length === 0 ? (
          <p className="font-ui py-4 text-sm text-stone-500">
            Nenhum fecho diário executado ainda.
          </p>
        ) : (
          <table className="font-ui w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-sand-200 bg-sand-50/80 text-[11px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Hotel</th>
                <th className="px-3 py-2.5">Ocupação</th>
                <th className="px-3 py-2.5">ADR</th>
                <th className="px-3 py-2.5">RevPAR</th>
                <th className="px-3 py-2.5">Alojamento</th>
                <th className="px-3 py-2.5">Extras</th>
                <th className="px-3 py-2.5">No-Shows</th>
                <th className="px-3 py-2.5">Alertas Sistema Central</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-sand-100">
                  <td className="px-3 py-2.5 font-medium text-ink-900">
                    {r.businessDate.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5 text-stone-600">{r.hotel.name}</td>
                  <td className="px-3 py-2.5">
                    {Number(r.occupancyPercent).toFixed(1)}% ({r.occupiedRooms}/{r.sellableRooms})
                  </td>
                  <td className="px-3 py-2.5 font-medium">{money(r.adr, r.currency)}</td>
                  <td className="px-3 py-2.5 font-medium">{money(r.revpar, r.currency)}</td>
                  <td className="px-3 py-2.5">{money(r.accommodationRevenue, r.currency)}</td>
                  <td className="px-3 py-2.5">{money(r.extrasRevenue, r.currency)}</td>
                  <td className="px-3 py-2.5">{r.noShowsMarked}</td>
                  <td className="px-3 py-2.5">
                    {r.reconciliationAlerts > 0 ? (
                      <span className="font-semibold text-amber-800">
                        {r.reconciliationAlerts} pendente(s)
                      </span>
                    ) : (
                      <span className="text-teal-800">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
