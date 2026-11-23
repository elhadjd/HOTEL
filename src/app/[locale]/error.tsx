"use client";

import { useEffect } from "react";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-ui text-xs uppercase tracking-[0.28em] text-teal-600">SIGESC</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink-900">Algo correu mal</h1>
      <p className="font-ui mt-3 text-sm text-stone-500">
        Não foi possível apresentar esta página. Pode tentar novamente sem sair da
        aplicação.
      </p>
      {error?.digest ? (
        <p className="font-ui mt-2 text-xs text-stone-400">Ref: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="font-ui mt-6 inline-flex h-11 items-center rounded-md bg-teal-600 px-5 text-sm font-medium text-white hover:bg-teal-500"
      >
        Tentar novamente
      </button>
    </main>
  );
}
