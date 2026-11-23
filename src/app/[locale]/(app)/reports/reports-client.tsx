"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Bundle = {
  occupancy: {
    occupancyPercent: number;
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    blockedMaintenance: number;
    dirtyOrInspecting: number;
    formula: Record<string, string>;
    daily: Array<{ date: string; occupiedStays: number }>;
  };
  reservations: {
    confirmed: number;
    pending: number;
    cancelled: number;
    noShow: number;
  };
  stays: {
    checkIns: number;
    checkOuts: number;
    activeStays: number;
    extensions: number;
    earlyDepartures: number;
    averageStayNights: number;
  };
  housekeeping: {
    completed: number;
    pending: number;
    overdue: number;
    inspectionsApproved: number;
    inspectionsRejected: number;
    averageCleaningMinutes: number;
  };
  maintenance: {
    open: number;
    inProgress: number;
    resolved: number;
    blockingOpen: number;
    averageResolutionHours: number;
  };
  commerce: {
    consumptionLines: number;
    operationalTotal: number;
    handedOffLines: number;
    documentsCreated: number;
    cotacaoOrQuote: number;
    proforma: number;
    reconciliationRequired: number;
    centralTotalsSum: number;
    disclaimer: string;
  };
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-ui text-xs uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function ReportsClient({
  hotels,
  initial,
}: {
  hotels: SearchableOption[];
  initial: Bundle;
}) {
  const [hotelId, setHotelId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reports, setReports] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function params() {
    const p = new URLSearchParams();
    if (hotelId) p.set("hotelId", hotelId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/reports/operational?${params()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar relatórios");
        return;
      }
      setReports(data.reports);
    });
  }

  function exportCsv(section: string) {
    const p = params();
    p.set("format", "csv");
    p.set("section", section);
    window.location.href = `/api/v1/reports/operational?${p}`;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900">Relatórios operacionais</h1>
        <p className="font-ui mt-1 max-w-2xl text-sm text-stone-500">
          Indicadores calculados a partir da base de dados local. Cotação/Proforma não é
          pagamento recebido. Fórmulas documentadas em cada bloco.
        </p>
      </div>

      {error ? <p className="font-ui text-sm text-danger">{error}</p> : null}

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <SearchableSelect
          className="w-52"
          options={[{ value: "", label: "Todos os hotéis" }, ...hotels]}
          value={hotelId}
          onChange={setHotelId}
          clearable={false}
        />
        <label className="font-ui text-xs text-stone-500">
          De
          <input
            type="date"
            className="mt-1 block h-10 rounded-md border border-sand-200 px-3 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="font-ui text-xs text-stone-500">
          Até
          <input
            type="date"
            className="mt-1 block h-10 rounded-md border border-sand-200 px-3 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button type="button" size="sm" disabled={pending} onClick={refresh}>
          Actualizar
        </Button>
      </div>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Ocupação</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => exportCsv("occupancy")}>
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Taxa (agora)" value={`${reports.occupancy.occupancyPercent}%`} />
          <Metric label="Ocupados" value={reports.occupancy.occupiedRooms} />
          <Metric label="Disponíveis*" value={reports.occupancy.availableRooms} />
          <Metric label="Bloq. manutenção" value={reports.occupancy.blockedMaintenance} />
        </div>
        <p className="font-ui text-xs text-stone-400">
          {reports.occupancy.formula.occupancyPercent}. *{reports.occupancy.formula.availableNow}.{" "}
          {reports.occupancy.formula.note}
        </p>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Reservas</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => exportCsv("reservations")}
          >
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Metric label="Confirmadas" value={reports.reservations.confirmed} />
          <Metric label="Pendentes" value={reports.reservations.pending} />
          <Metric label="Canceladas" value={reports.reservations.cancelled} />
          <Metric label="No-shows" value={reports.reservations.noShow} />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Receção / estadias</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => exportCsv("stays")}>
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Check-ins" value={reports.stays.checkIns} />
          <Metric label="Check-outs" value={reports.stays.checkOuts} />
          <Metric label="Activas" value={reports.stays.activeStays} />
          <Metric label="Extensões" value={reports.stays.extensions} />
          <Metric label="Saídas antecipadas" value={reports.stays.earlyDepartures} />
          <Metric label="Permanência média" value={reports.stays.averageStayNights} />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Governança</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => exportCsv("housekeeping")}
          >
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Concluídas" value={reports.housekeeping.completed} />
          <Metric label="Pendentes" value={reports.housekeeping.pending} />
          <Metric label="Atrasadas" value={reports.housekeeping.overdue} />
          <Metric label="Insp. aprovadas" value={reports.housekeeping.inspectionsApproved} />
          <Metric label="Insp. rejeitadas" value={reports.housekeeping.inspectionsRejected} />
          <Metric label="Média limpeza (min)" value={reports.housekeeping.averageCleaningMinutes} />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Manutenção</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => exportCsv("maintenance")}
          >
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Abertas" value={reports.maintenance.open} />
          <Metric label="Em andamento" value={reports.maintenance.inProgress} />
          <Metric label="Resolvidas" value={reports.maintenance.resolved} />
          <Metric label="Bloqueantes abertas" value={reports.maintenance.blockingOpen} />
          <Metric label="Média resolução (h)" value={reports.maintenance.averageResolutionHours} />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Operações comerciais</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => exportCsv("commerce")}>
            CSV
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Linhas consumo" value={reports.commerce.consumptionLines} />
          <Metric
            label="Total operacional"
            value={reports.commerce.operationalTotal.toFixed(2)}
          />
          <Metric label="Cotação / Quote" value={reports.commerce.cotacaoOrQuote} />
          <Metric label="Proforma" value={reports.commerce.proforma} />
          <Metric label="Reconciliação" value={reports.commerce.reconciliationRequired} />
          <Metric
            label="Totais centrais"
            value={reports.commerce.centralTotalsSum.toFixed(2)}
          />
        </div>
        <p className="font-ui text-xs text-amber-800">{reports.commerce.disclaimer}</p>
      </section>
    </div>
  );
}
