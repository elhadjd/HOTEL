import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { getGuest } from "@/modules/guests/guest-service";
import { GuestMappingClient } from "./guest-mapping-client";
import { GuestProfileEditButton } from "./guest-profile-edit-button";
import type { GuestDTO } from "../guest-form-drawer";

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; guestId: string }>;
}) {
  const { locale, guestId } = await params;
  setRequestLocale(locale);
  const ctx = await requirePageTenant("guests.read");
  const guest = await getGuest(prisma, ctx, guestId);

  const guestDto: GuestDTO = {
    id: guest.id,
    salutation: guest.salutation,
    firstName: guest.firstName,
    lastName: guest.lastName,
    customerType: guest.customerType,
    companyName: guest.companyName,
    nif: guest.nif,
    email: guest.email,
    phone: guest.phone,
    secondaryPhone: guest.secondaryPhone,
    birthDate: guest.birthDate ? guest.birthDate.toISOString().slice(0, 10) : null,
    gender: guest.gender,
    nationality: guest.nationality,
    preferredLanguage: guest.preferredLanguage,
    address: guest.address,
    city: guest.city,
    province: guest.province,
    postalCode: guest.postalCode,
    country: guest.country,
    vipTier: guest.vipTier,
    dietaryRestrictions: guest.dietaryRestrictions,
    roomPreferences: guest.roomPreferences,
    emergencyContactName: guest.emergencyContactName,
    emergencyContactPhone: guest.emergencyContactPhone,
    marketingOptIn: guest.marketingOptIn,
    notes: guest.notes,
    documents: guest.documents.map((d) => ({
      id: d.id,
      type: d.type,
      reference: d.reference,
      issuingCountry: d.issuingCountry,
      issuedAt: d.issuedAt ? d.issuedAt.toISOString().slice(0, 10) : null,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null,
    })),
    customerMapping: guest.customerMapping
      ? {
          syncStatus: guest.customerMapping.syncStatus,
          externalCustomerId: guest.customerMapping.externalCustomerId,
        }
      : null,
  };

  const doc = guest.documents[0];
  const fullName = [guest.salutation, guest.firstName, guest.lastName].filter(Boolean).join(" ");

  return (
    <AppShell title={fullName}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/guests" className="font-ui text-sm text-teal-700 hover:underline">
          ← Hóspedes
        </Link>
        <GuestProfileEditButton guest={guestDto} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <Badge tone="accent">{guest.customerMapping?.syncStatus ?? "UNLINKED"}</Badge>
        {guest.vipTier && guest.vipTier !== "STANDARD" ? (
          <Badge tone="warning">VIP · {guest.vipTier}</Badge>
        ) : null}
        {guest.customerType === "company" ? <Badge tone="neutral">Empresa</Badge> : null}
        <p className="font-ui text-sm text-stone-500">
          {[guest.email, guest.phone, guest.nif ? `NIF ${guest.nif}` : null]
            .filter(Boolean)
            .join(" · ") || "Sem contacto"}
        </p>
      </div>

      {/* Hospitality Profile Overview */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="surface p-4 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Identificação & Fiscalidade
          </h3>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">NIF</dt>
              <dd className="font-mono text-ink-900">{guest.nif || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Empresa / Entidade</dt>
              <dd className="text-ink-900">{guest.companyName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Data de nascimento</dt>
              <dd className="tabular-nums text-ink-900">{guestDto.birthDate || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Nacionalidade / Idioma</dt>
              <dd className="text-ink-900">
                {[guest.nationality, guest.preferredLanguage?.toUpperCase()]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="surface p-4 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Documento & Morada
          </h3>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Documento</dt>
              <dd className="font-mono text-ink-900">
                {doc ? `${doc.type} · ${doc.reference}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Validade / País</dt>
              <dd className="text-ink-900">
                {[
                  doc?.expiresAt ? doc.expiresAt.toISOString().slice(0, 10) : null,
                  doc?.issuingCountry,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Morada</dt>
              <dd className="text-right text-ink-900">{guest.address || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Cidade / País</dt>
              <dd className="text-ink-900">
                {[guest.city, guest.province, guest.country].filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="surface p-4 text-sm md:col-span-2 xl:col-span-1">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Preferências & Emergência
          </h3>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Quarto</dt>
              <dd className="text-right text-ink-900">{guest.roomPreferences || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Alergias / Dieta</dt>
              <dd className="text-right text-ink-900">{guest.dietaryRestrictions || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Emergência</dt>
              <dd className="text-right text-ink-900">
                {[guest.emergencyContactName, guest.emergencyContactPhone]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
            {guest.notes ? (
              <div className="border-t border-sand-100 pt-2 text-stone-600">{guest.notes}</div>
            ) : null}
          </dl>
        </section>
      </div>

      <GuestMappingClient
        guestId={guest.id}
        syncStatus={guest.customerMapping?.syncStatus ?? "UNLINKED"}
        externalCustomerId={guest.customerMapping?.externalCustomerId ?? null}
      />
    </AppShell>
  );
}
