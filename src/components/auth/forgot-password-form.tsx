"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({
  labels,
}: {
  labels: {
    email: string;
    submit: string;
    success: string;
    notFound: string;
  };
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (res.status === 429) {
        setError(data.error ?? "Too many requests");
        return;
      }
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Falha ao enviar email");
        return;
      }
      setMessage(data.message ?? labels.success);
      setEmail("");
    });
  }

  return (
    <form className="font-ui mt-8 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.email}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-teal-700">{message}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : labels.submit}
      </Button>
    </form>
  );
}
