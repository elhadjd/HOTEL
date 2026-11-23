import { cn } from "@/shared/utils";

const tones: Record<string, string> = {
  AVAILABLE: "bg-teal-50 text-teal-800 border-teal-200",
  OCCUPIED: "bg-ink-900 text-white border-ink-900",
  RESERVED: "bg-amber-50 text-amber-900 border-amber-200",
  CLEAN: "bg-emerald-50 text-emerald-800 border-emerald-200",
  DIRTY: "bg-rose-50 text-rose-800 border-rose-200",
  CLEANING: "bg-sky-50 text-sky-800 border-sky-200",
  INSPECTING: "bg-violet-50 text-violet-800 border-violet-200",
  OK: "bg-stone-100 text-stone-700 border-stone-200",
  UNDER_MAINTENANCE: "bg-orange-50 text-orange-900 border-orange-200",
  OUT_OF_SERVICE: "bg-rose-100 text-rose-900 border-rose-300",
  DRAFT: "bg-stone-100 text-stone-600 border-stone-200",
  PENDING: "bg-amber-50 text-amber-900 border-amber-200",
  PENDING_SUBMISSION: "bg-amber-50 text-amber-900 border-amber-200",
  SUBMITTING: "bg-sky-50 text-sky-800 border-sky-200",
  CREATED: "bg-teal-50 text-teal-800 border-teal-200",
  RECONCILIATION_REQUIRED: "bg-orange-50 text-orange-900 border-orange-200",
  FAILED_VALIDATION: "bg-rose-50 text-rose-800 border-rose-200",
  FAILED_FINAL: "bg-rose-100 text-rose-900 border-rose-300",
  CONFIRMED: "bg-teal-50 text-teal-800 border-teal-200",
  CHECKED_IN: "bg-ink-900 text-white border-ink-900",
  CHECKED_OUT: "bg-stone-200 text-stone-700 border-stone-300",
  CANCELLED: "bg-rose-50 text-rose-800 border-rose-200",
  NO_SHOW: "bg-orange-50 text-orange-900 border-orange-200",
  Cotação: "bg-sky-50 text-sky-900 border-sky-200",
  Proforma: "bg-teal-50 text-teal-900 border-teal-200",
  Publicado: "bg-ink-900 text-white border-ink-900",
  Pago: "bg-emerald-50 text-emerald-900 border-emerald-200",
  Cancelado: "bg-rose-50 text-rose-800 border-rose-200",
};

export function StatusPill({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-ui inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tones[value] ?? "bg-stone-100 text-stone-700 border-stone-200",
        className,
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
