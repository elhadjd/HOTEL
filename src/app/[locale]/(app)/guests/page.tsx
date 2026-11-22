import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listGuests } from "@/modules/guests/guest-service";
import { CreateGuestForm } from "./create-guest-form";

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("guests.read");
  const guests = await listGuests(prisma, ctx, { q });

  return (
    <AppShell title={t("nav.guests")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Perfis operacionais — cada hóspede novo exige Cliente SIGESC. Históricos em
          NEEDS_RESOLUTION devem ser resolvidos antes de reservas/faturas.
        </p>
        <Badge tone="accent">Phase 5</Badge>
      </div>

      <form className="mb-4" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Pesquisar nome, email, telefone…"
          className="font-ui h-10 w-full max-w-md rounded-md border border-sand-200 bg-white px-3 text-sm"
        />
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="surface overflow-hidden">
          {guests.length === 0 ? (
            <EmptyState title={t("nav.guests")} description={t("common.empty")} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contacto</th>
                  <th>SIGESC</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td className="font-medium text-ink-900">
                      <a href={`/guests/${guest.id}`} className="text-teal-800 hover:underline">
                        {guest.firstName} {guest.lastName}
                      </a>
                    </td>
                    <td className="text-stone-600">
                      {[guest.email, guest.phone].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="text-stone-500">
                      {guest.customerMapping?.syncStatus ?? "UNLINKED"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <CreateGuestForm />
      </div>
    </AppShell>
  );
}
