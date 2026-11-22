"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function CreateHotelForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code: code || undefined, city: city || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      setName("");
      setCode("");
      setCity("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface animate-fade-up p-5">
      <h3 className="text-lg font-semibold text-ink-900">Novo hotel</h3>
      <div className="font-ui mt-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-stone-500">Nome</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Código</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Opcional"
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="text-stone-500">Cidade</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
          />
        </label>
        {error ? <p className="text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "…" : "Criar hotel"}
        </Button>
      </div>
    </form>
  );
}
