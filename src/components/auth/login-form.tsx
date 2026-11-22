"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  const router = useRouter();
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
      if (result?.error) {
        setError(labels.error);
        return;
      }
      // Session callback will expose mustChangePassword; fetch session briefly
      const sessionRes = await fetch("/api/auth/session");
      const session = (await sessionRes.json()) as {
        user?: { mustChangePassword?: boolean };
      };
      if (session.user?.mustChangePassword) {
        router.push("/set-password");
        router.refresh();
        return;
      }
      router.push("/dashboard");
      router.refresh();
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
