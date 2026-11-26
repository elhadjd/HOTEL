"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function CreateRoomForm({
  hotelId,
  categories,
}: {
  hotelId: string;
  categories: Array<{ id: string; name: string; code?: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        setError(data.error ?? "Falha ao criar quarto");
        return;
      }
      setCode("");
      setFloor("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Novo quarto
      </Button>

      <FormDrawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Quartos & Inventário"
        title="Novo quarto"
        subtitle="Associe o quarto a uma categoria operacional e defina o código e andar."
        size="md"
        onSubmit={onSubmit}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !categoryId}>
              {pending ? "A criar…" : "Criar quarto"}
            </Button>
          </div>
        }
      >
        <div className="surface space-y-4 p-4 text-sm">
          <div className="block">
            <span className="text-stone-600">Categoria *</span>
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
            <span className="text-stone-600">Código do quarto *</span>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex.: 101, 204-A, Suite-01"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
            />
          </label>
          <label className="block">
            <span className="text-stone-600">Andar</span>
            <input
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="Ex.: 1, 2, Rés-do-chão"
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
            />
          </label>
          {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
        </div>
      </FormDrawer>
    </>
  );
}
