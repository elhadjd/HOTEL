"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function CreateCategoryForm({ hotelId }: { hotelId: string }) {
  const router = useRouter();
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
        setError(data.error ?? "Failed");
        return;
      }
      setName("");
      setCode("");
      setDefaultTariff("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface h-fit p-5">
      <h3 className="text-lg font-semibold text-ink-900">Nova categoria</h3>
      <div className="font-ui mt-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-stone-500">Nome</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
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
          <span className="text-stone-500">Tarifa operacional</span>
          <input
            type="number"
            min={0}
            value={defaultTariff}
            onChange={(e) => setDefaultTariff(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
          />
        </label>
        {error ? <p className="text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "…" : "Criar categoria"}
        </Button>
      </div>
    </form>
  );
}
