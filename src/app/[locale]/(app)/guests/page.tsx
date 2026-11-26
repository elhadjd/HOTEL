import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listGuests } from "@/modules/guests/guest-service";
import { GuestsWorkspaceClient } from "./guests-workspace-client";
import type { GuestDTO } from "./guest-form-drawer";

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

  const serialized: GuestDTO[] = guests.map((g) => ({
    id: g.id,
    salutation: g.salutation,
    firstName: g.firstName,
    lastName: g.lastName,
    customerType: g.customerType,
    companyName: g.companyName,
    nif: g.nif,
    email: g.email,
    phone: g.phone,
    secondaryPhone: g.secondaryPhone,
    birthDate: g.birthDate ? g.birthDate.toISOString().slice(0, 10) : null,
    gender: g.gender,
    nationality: g.nationality,
    preferredLanguage: g.preferredLanguage,
    address: g.address,
    city: g.city,
    province: g.province,
    postalCode: g.postalCode,
    country: g.country,
    vipTier: g.vipTier,
    dietaryRestrictions: g.dietaryRestrictions,
    roomPreferences: g.roomPreferences,
    emergencyContactName: g.emergencyContactName,
    emergencyContactPhone: g.emergencyContactPhone,
    marketingOptIn: g.marketingOptIn,
    notes: g.notes,
    documents: g.documents.map((d) => ({
      id: d.id,
      type: d.type,
      reference: d.reference,
      issuingCountry: d.issuingCountry,
      issuedAt: d.issuedAt ? d.issuedAt.toISOString().slice(0, 10) : null,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null,
    })),
    customerMapping: g.customerMapping
      ? {
          syncStatus: g.customerMapping.syncStatus,
          externalCustomerId: g.customerMapping.externalCustomerId,
        }
      : null,
  }));

  return (
    <AppShell title={t("nav.guests")}>
      <GuestsWorkspaceClient initialGuests={serialized} initialQuery={q ?? ""} />
    </AppShell>
  );
}
