import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getGuest } from "@/modules/guests/guest-service";
import { GuestMappingClient } from "./guest-mapping-client";

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; guestId: string }>;
}) {
  const { locale, guestId } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("guests.read");
  const guest = await getGuest(prisma, ctx, guestId);

  return (
    <AppShell title={`${guest.firstName} ${guest.lastName}`}>
      <div className="mb-4">
        <Link href="/guests" className="font-ui text-sm text-teal-700 hover:underline">
          ← Hóspedes
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone="accent">{guest.customerMapping?.syncStatus ?? "UNLINKED"}</Badge>
        <p className="font-ui text-sm text-stone-500">
          {[guest.email, guest.phone, guest.country].filter(Boolean).join(" · ") || "Sem contacto"}
        </p>
      </div>
      <GuestMappingClient
        guestId={guest.id}
        syncStatus={guest.customerMapping?.syncStatus ?? "UNLINKED"}
        externalCustomerId={guest.customerMapping?.externalCustomerId ?? null}
      />
    </AppShell>
  );
}
