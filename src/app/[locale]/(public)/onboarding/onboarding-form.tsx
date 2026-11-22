"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OnboardingForm({
  labels,
}: {
  labels: {
    title: string;
    help: string;
    keyLabel: string;
    submit: string;
    success: string;
  };
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/onboarding/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        institutionId?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Onboarding failed");
        return;
      }
      // Clear key from memory / input after submit
      setApiKey("");
      router.push("/dashboard");
    });
  }

  return (
    <form className="font-ui mt-8 space-y-4" onSubmit={onSubmit}>
      <p className="text-sm text-stone-500">{labels.help}</p>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.keyLabel}</span>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="mca_…"
          required
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono text-sm outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : labels.submit}
      </Button>
    </form>
  );
}
