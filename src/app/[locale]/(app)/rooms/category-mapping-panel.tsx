"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CategoryMappingPanel({
  hotelId,
  categories,
  catalogMappings,
}: {
  hotelId: string;
  categories: Array<{
    id: string;
    name: string;
    code: string;
    accommodationMappingId: string | null;
  }>;
  catalogMappings: Array<{
    id: string;
    localCode: string;
    localLabel: string;
    centralSalePrice: number | null;
  }>;
}) {
  const router = useRouter();
  const [selectedByCat, setSelectedByCat] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c.id, c.accommodationMappingId ?? ""])),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(categoryId: string) {
    setStatus(null);
    setError(null);
    const mappingId = selectedByCat[categoryId] || null;
    startTransition(async () => {
      const res = await fetch(`/api/v1/hotels/${hotelId}/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accommodationMappingId: mappingId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao actualizar mapeamento de alojamento");
        return;
      }
      setStatus("Mapeamento SIGESC guardado — próximos check-ins usam este produto automaticamente.");
      router.refresh();
    });
  }

  if (categories.length === 0) return null;

  return (
    <div className="surface p-5">
      <h3 className="text-lg font-semibold text-ink-900">Alojamento ↔ Catálogo SIGESC</h3>
      <p className="font-ui mt-1 text-xs text-stone-500">
        Associe cada categoria de quarto a um serviço/produto SIGESC para lançar automaticamente
        as noites na conta da estadia e na Proforma do check-out.
      </p>
      {error ? <p className="font-ui mt-2 text-xs text-danger">{error}</p> : null}
      {status ? <p className="font-ui mt-2 text-xs text-teal-800">{status}</p> : null}
      <div className="font-ui mt-4 space-y-3 text-sm">
        {categories.map((cat) => (
          <div key={cat.id} className="space-y-1.5 border-b border-sand-100 pb-3 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink-900">{cat.name}</span>
              <span className="text-xs text-stone-400">{cat.code}</span>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedByCat[cat.id] ?? ""}
                onChange={(e) =>
                  setSelectedByCat((prev) => ({ ...prev, [cat.id]: e.target.value }))
                }
                className="h-9 flex-1 rounded-md border border-sand-200 bg-white px-2 text-xs"
              >
                <option value="">Sem produto SIGESC associado</option>
                {catalogMappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.localCode} · {m.localLabel}
                    {m.centralSalePrice != null ? ` (${m.centralSalePrice} AOA)` : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => save(cat.id)}
              >
                Guardar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
