import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PERMISSIONS } from "@/modules/iam/permissions";

export default async function ForbiddenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ permission?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const matched = query.permission
    ? PERMISSIONS.find((p) => p.code === query.permission)
    : undefined;

  return (
    <AppShell title="Acesso restrito">
      <div className="mx-auto my-12 max-w-lg">
        <div className="surface p-8 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-ink-900">Sem permissão de acesso</h2>
          <p className="mt-2 text-sm text-stone-600">
            A sua conta não possui autorização para aceder a esta funcionalidade.
          </p>
          {matched ? (
            <p className="mt-3 inline-block rounded-md bg-sand-100 px-3 py-1.5 text-xs font-medium text-stone-700">
              Permissão necessária: {matched.label} ({matched.code})
            </p>
          ) : null}
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-500"
            >
              Voltar ao painel
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
