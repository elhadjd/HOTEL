"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function CreateRoomForm({
  hotelId,
  categories,
}: {
  hotelId: string;
  categories: Array<{ id: string; name: string; code?: string | null }>;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [floor, setFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/hotels/${hotelId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          code,
          floor: floor || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      setCode("");
      setFloor("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface h-fit p-5">
      <h3 className="text-lg font-semibold text-ink-900">Novo quarto</h3>
      <div className="font-ui mt-4 space-y-3 text-sm">
        <div className="block">
          <span className="text-stone-500">Categoria</span>
          <SearchableSelect
            className="mt-1"
            required
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
              keywords: [c.code ?? "", c.name],
            }))}
            value={categoryId}
            onChange={setCategoryId}
            labels={{ placeholder: "Seleccionar categoria", searchPlaceholder: "Nome / código…" }}
            clearable={false}
          />
        </div>
        <label className="block">
          <span className="text-stone-500">Código</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Andar</span>
          <input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        {error ? <p className="text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending || !categoryId}>
          {pending ? "…" : "Criar quarto"}
        </Button>
      </div>
    </form>
  );
}
