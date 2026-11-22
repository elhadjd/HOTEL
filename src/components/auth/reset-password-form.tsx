"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({
  token,
  labels,
}: {
  token: string;
  labels: {
    password: string;
    confirm: string;
    submit: string;
  };
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Reset failed");
        return;
      }
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <form className="font-ui mt-8 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.password}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.confirm}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : labels.submit}
      </Button>
    </form>
  );
}
