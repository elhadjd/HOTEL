"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { safeCallbackPath } from "@/shared/safe-redirect";

function postLoginPath(mustChangePassword: boolean): string {
  if (mustChangePassword) return "/set-password";
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("callbackUrl");
  return safeCallbackPath(raw) ?? "/dashboard";
}

export function LoginForm({
  labels,
}: {
  labels: {
    email: string;
    password: string;
    submit: string;
    forgot: string;
    error: string;
  };
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setError(labels.error);
        return;
      }

      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionRes.json()) as {
        user?: { id?: string; mustChangePassword?: boolean };
      };

      if (!session.user?.id) {
        setError(labels.error);
        return;
      }

      // Hard navigation so the new session cookie is always picked up by middleware
      window.location.assign(postLoginPath(Boolean(session.user.mustChangePassword)));
    });
  }

  return (
    <form className="font-ui mt-8 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-stone-500">{labels.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : labels.submit}
      </Button>
      <p className="text-center text-sm">
        <Link className="text-teal-600 underline-offset-2 hover:underline" href="/forgot-password">
          {labels.forgot}
        </Link>
      </p>
    </form>
  );
}
