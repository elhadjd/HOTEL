"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";

export function CreateCategoryForm({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [defaultTariff, setDefaultTariff] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/hotels/${hotelId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          defaultTariff: defaultTariff ? Number(defaultTariff) : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar categoria");
        return;
      }
      setName("");
      setCode("");
      setDefaultTariff("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nova categoria
      </Button>

      <FormDrawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Categorias de Quartos"
        title="Nova categoria"
        subtitle="Defina tipologia de quarto, código e tarifa operacional de referência."
        size="md"
        onSubmit={onSubmit}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A criar…" : "Criar categoria"}
            </Button>
          </div>
        }
      >
        <div className="surface space-y-4 p-4 text-sm">
          <label className="block">
            <span className="text-stone-600">Nome *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Suite Executiva"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
            />
          </label>
          <label className="block">
            <span className="text-stone-600">Código *</span>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex.: SUITE-EXEC"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
            />
          </label>
          <label className="block">
            <span className="text-stone-600">Tarifa operacional (AOA)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultTariff}
              onChange={(e) => setDefaultTariff(e.target.value)}
              placeholder="Opcional"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
            />
          </label>
          {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
        </div>
      </FormDrawer>
    </>
  );
}
