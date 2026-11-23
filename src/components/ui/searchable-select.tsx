"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/shared/utils";

export type SearchableOption = {
  value: string;
  label: string;
  /** Extra searchable fields (code, email, phone, sku, …) */
  keywords?: string[];
  description?: string;
  disabled?: boolean;
};

export type SearchableSelectLabels = {
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  noResults?: string;
  clear?: string;
  loading?: string;
  error?: string;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function matchesQuery(option: SearchableOption, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const haystack = [option.label, option.description, ...(option.keywords ?? [])]
    .filter(Boolean)
    .map((v) => normalize(String(v)));
  return haystack.some((h) => h.includes(q));
}

export function SearchableSelect({
  options,
  value,
  onChange,
  labels,
  disabled,
  loading,
  error,
  clearable = true,
  className,
  id,
  name,
  required,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  labels?: SearchableSelectLabels;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  clearable?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
}) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const inputId = id ?? `${autoId}-input`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const matched = options.filter((o) => matchesQuery(o, deferredQuery));
    // Cap DOM nodes for very large catalogs while still filtering client-side
    return matched.slice(0, 200);
  }, [options, deferredQuery]);

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function selectValue(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) selectValue(opt.value);
    }
  }

  const placeholder = labels?.placeholder ?? "Seleccionar…";
  const searchPlaceholder = labels?.searchPlaceholder ?? "Pesquisar…";

  return (
    <div ref={rootRef} className={cn("font-ui relative", className)}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={inputId}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border bg-white px-3 text-left text-sm outline-none transition",
          "border-sand-200 ring-teal-500/30 focus-visible:ring-2",
          disabled || loading ? "cursor-not-allowed opacity-60" : "hover:border-sand-200/80",
          error ? "border-danger" : null,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-ink-900" : "text-stone-400")}>
          {loading ? labels?.loading ?? "A carregar…" : selected?.label ?? placeholder}
        </span>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-stone-400" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-stone-400" />
        )}
      </button>

      {clearable && value && !disabled ? (
        <button
          type="button"
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-sand-100 hover:text-ink-800"
          aria-label={labels?.clear ?? "Limpar"}
          onClick={(e) => {
            e.stopPropagation();
            selectValue("");
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-sand-200 bg-white shadow-[var(--shadow-soft)] animate-fade-up">
          <div className="border-b border-sand-100 p-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-sand-200 bg-sand-50 pl-8 pr-3 text-sm outline-none ring-teal-500/30 focus:ring-2"
                aria-autocomplete="list"
                aria-controls={listboxId}
              />
            </label>
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={inputId}
            className="max-h-60 overflow-y-auto py-1"
          >
            {error ? (
              <li className="px-3 py-6 text-center text-sm text-danger">
                {labels?.error ?? error}
              </li>
            ) : options.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-stone-500">
                {labels?.empty ?? "Sem opções"}
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-stone-500">
                {labels?.noResults ?? "Sem resultados"}
              </li>
            ) : (
              filtered.map((opt, index) => {
                const active = opt.value === value;
                const highlighted = index === highlight;
                return (
                  <li key={opt.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      disabled={opt.disabled}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                        highlighted ? "bg-teal-50" : "hover:bg-sand-50",
                        opt.disabled ? "cursor-not-allowed opacity-50" : null,
                      )}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        if (!opt.disabled) selectValue(opt.value);
                      }}
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          active ? "text-teal-600 opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900">{opt.label}</span>
                        {opt.description ? (
                          <span className="mt-0.5 block truncate text-xs text-stone-500">
                            {opt.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {filtered.length >= 200 ? (
            <p className="border-t border-sand-100 px-3 py-2 text-[11px] text-stone-400">
              A mostrar os primeiros 200 resultados — refine a pesquisa.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Pure helper exported for unit tests */
export function filterSearchableOptions(
  options: SearchableOption[],
  query: string,
  limit = 200,
): SearchableOption[] {
  return options.filter((o) => matchesQuery(o, query)).slice(0, limit);
}
