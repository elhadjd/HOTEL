"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Preview = {
  challengeToken: string;
  expiresAt: string;
  keyPrefix: string;
  keyName: string | null;
  scopes: string[];
  company: {
    name: string;
    email: string | null;
    nif: string | null;
    city: string | null;
    country: string | null;
    externalId: string;
  };
  administrator: {
    email: string;
    fullName: string;
    accessLevel: string;
  };
  usersToImport: number;
  alreadyLinked: boolean;
};

type ConfirmResult = {
  institutionId: string;
  administratorEmail: string;
  administratorName: string;
  emailQueued: boolean;
  alreadyExisted: boolean;
  usersUpserted: number;
};

export function OnboardingForm({
  labels,
}: {
  labels: {
    welcome: string;
    help: string;
    keyLabel: string;
    validate: string;
    confirmTitle: string;
    company: string;
    administrator: string;
    users: string;
    confirm: string;
    cancel: string;
    successTitle: string;
    successEmail: string;
    goLogin: string;
    alreadyLinked: string;
  };
}) {
  const [step, setStep] = useState<"key" | "confirm" | "done">("key");
  const [apiKey, setApiKey] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onValidate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/onboarding/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = (await res.json().catch(() => ({}))) as Preview & { error?: string };
      // Clear key from memory immediately after submit
      setApiKey("");
      if (!res.ok) {
        setError(data.error ?? "Validation failed");
        return;
      }
      setPreview(data);
      setStep("confirm");
    });
  }

  function onConfirm() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/onboarding/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: preview.challengeToken }),
      });
      const data = (await res.json().catch(() => ({}))) as ConfirmResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Confirmation failed");
        return;
      }
      setResult(data);
      setPreview(null);
      setStep("done");
    });
  }

  if (step === "done" && result) {
    return (
      <div className="font-ui mt-8 space-y-4 animate-fade-up">
        <h2 className="text-xl font-semibold text-ink-900">{labels.successTitle}</h2>
        <p className="text-sm text-stone-600">
          {result.emailQueued ? labels.successEmail : labels.alreadyLinked}
        </p>
        <p className="text-sm text-stone-500">
          {result.administratorName} · {result.administratorEmail}
        </p>
        <Button asChild className="w-full">
          <Link href="/login">{labels.goLogin}</Link>
        </Button>
      </div>
    );
  }

  if (step === "confirm" && preview) {
    return (
      <div className="font-ui mt-8 space-y-5 animate-fade-up">
        <h2 className="text-xl font-semibold text-ink-900">{labels.confirmTitle}</h2>
        <div className="space-y-3 rounded-md border border-sand-200 bg-sand-50/60 p-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-400">{labels.company}</p>
            <p className="mt-1 font-medium text-ink-900">{preview.company.name}</p>
            <p className="text-stone-500">
              {[preview.company.nif, preview.company.city, preview.company.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-400">{labels.administrator}</p>
            <p className="mt-1 font-medium text-ink-900">{preview.administrator.fullName}</p>
            <p className="text-stone-500">
              {preview.administrator.email} · {preview.administrator.accessLevel}
            </p>
          </div>
          <p className="text-stone-500">
            {labels.users}: {preview.usersToImport}
            {preview.alreadyLinked ? ` · ${labels.alreadyLinked}` : ""}
          </p>
          <p className="font-mono text-xs text-stone-400">{preview.keyPrefix}…</p>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => {
              setPreview(null);
              setStep("key");
            }}
          >
            {labels.cancel}
          </Button>
          <Button type="button" className="flex-1" disabled={pending} onClick={onConfirm}>
            {pending ? "…" : labels.confirm}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="font-ui mt-8 space-y-4" onSubmit={onValidate}>
      <p className="text-sm leading-relaxed text-stone-500">{labels.welcome}</p>
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
        {pending ? "…" : labels.validate}
      </Button>
    </form>
  );
}
