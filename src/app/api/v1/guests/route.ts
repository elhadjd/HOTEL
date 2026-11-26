import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createGuest, listGuests } from "@/modules/guests/guest-service";
import { createCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const documentSchema = z
  .object({
    type: z.string().min(1).max(64),
    reference: z.string().min(1).max(128),
    issuingCountry: z.string().max(120).optional().nullable(),
    issuedAt: z.string().max(32).optional().nullable(),
    expiresAt: z.string().max(32).optional().nullable(),
  })
  .optional()
  .nullable();

const hospitalityFieldsShape = {
  salutation: z.string().max(32).optional().nullable(),
  customerType: z.enum(["individual", "company"]).optional().nullable(),
  companyName: z.string().max(191).optional().nullable(),
  nif: z.string().max(64).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  secondaryPhone: z.string().max(40).optional().nullable(),
  birthDate: z.string().max(32).optional().nullable(),
  gender: z.string().max(24).optional().nullable(),
  nationality: z.string().max(120).optional().nullable(),
  preferredLanguage: z.string().max(16).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  province: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  countryId: z.number().int().positive().optional().nullable(),
  vipTier: z.string().max(32).optional().nullable(),
  dietaryRestrictions: z.string().max(255).optional().nullable(),
  roomPreferences: z.string().max(255).optional().nullable(),
  emergencyContactName: z.string().max(120).optional().nullable(),
  emergencyContactPhone: z.string().max(40).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
  document: documentSchema,
  // Optional central-only commercial fields when creating customer simultaneously
  customerCode: z.string().max(64).optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  sponsorCode: z.string().max(64).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
};

const createSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing_customer"),
    centralCustomerId: z.union([z.string(), z.number()]),
    firstName: z.string().min(1).max(120).optional(),
    lastName: z.string().min(1).max(120).optional(),
    ...hospitalityFieldsShape,
  }),
  z.object({
    mode: z.literal("new_customer"),
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    ...hospitalityFieldsShape,
  }),
]);

export async function GET(request: Request) {
  const authz = await requireTenant("guests.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const linkedOnly = url.searchParams.get("linkedOnly") === "1";
  const takeRaw = url.searchParams.get("take");
  const take = takeRaw ? Math.min(Math.max(Number(takeRaw) || 50, 1), 200) : undefined;

  try {
    const guests = await listGuests(prisma, authz.ctx, { q, linkedOnly, take });
    return NextResponse.json({
      guests,
      capped: guests.length >= (take ?? 100),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("guests.write");
  if (!authz.ok) return authz.response;
  // Phase 5: every Guest create touches Aggregate customers — require both permissions
  const customersAuthz = await requireTenant("integrations.customers");
  if (!customersAuthz.ok) return customersAuthz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Backward-compat: plain body without mode → reject (Phase 5 requires customer)
  const withMode =
    typeof json === "object" && json !== null && !("mode" in json)
      ? { ...(json as object), mode: "existing_customer" as const }
      : json;

  const parsed = createSchema.safeParse(withMode);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Dados do hóspede inválidos. Verifique os campos obrigatórios e formatos (email, datas).",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.mode === "existing_customer") {
      if (!parsed.data.centralCustomerId) {
        return NextResponse.json({ error: "centralCustomerId is required" }, { status: 400 });
      }
      const customerModule = await import(
        "@/modules/sigesc-integration/customers/customers-service"
      );
      const customer = await customerModule.getCentralCustomer(
        prisma,
        authz.ctx,
        parsed.data.centralCustomerId,
      );
      const d = parsed.data;
      const guest = await createGuest(prisma, authz.ctx, {
        salutation: d.salutation,
        firstName: d.firstName?.trim() || customer.name,
        lastName:
          d.lastName?.trim() ||
          customer.surname ||
          customer.full_name?.split(/\s+/).slice(1).join(" ") ||
          "—",
        customerType: d.customerType ?? customer.customer_type ?? "individual",
        companyName: d.companyName,
        nif: d.nif ?? customer.nif,
        email: d.email,
        phone: d.phone,
        secondaryPhone: d.secondaryPhone,
        birthDate: d.birthDate ?? customer.birth_date,
        gender: d.gender ?? customer.sex,
        nationality: d.nationality,
        preferredLanguage: d.preferredLanguage,
        address: d.address ?? customer.address,
        city: d.city ?? customer.city,
        province: d.province ?? customer.province,
        postalCode: d.postalCode,
        country: d.country ?? customer.country?.name,
        vipTier: d.vipTier,
        dietaryRestrictions: d.dietaryRestrictions,
        roomPreferences: d.roomPreferences,
        emergencyContactName: d.emergencyContactName,
        emergencyContactPhone: d.emergencyContactPhone,
        marketingOptIn: d.marketingOptIn,
        notes: d.notes,
        document: d.document,
        centralCustomerId: customer.id,
      });
      return NextResponse.json({ guest }, { status: 201 });
    }

    // Workflow B — create central customer first with ALL accepted central fields, then guest.
    const newGuest = parsed.data;
    const isCompany = newGuest.customerType === "company";
    let created;
    try {
      created = await createCentralCustomer(prisma, authz.ctx, {
        name: isCompany && newGuest.companyName?.trim() ? newGuest.companyName.trim() : newGuest.firstName,
        surname: isCompany ? null : newGuest.lastName,
        customer_type: newGuest.customerType ?? "individual",
        email: newGuest.email ?? null,
        phone: newGuest.phone ?? null,
        nif: newGuest.nif ?? null,
        address: newGuest.address ?? null,
        city: newGuest.city ?? null,
        province: newGuest.province ?? null,
        country_id: newGuest.countryId ?? null,
        birth_date: isCompany ? null : (newGuest.birthDate ?? null),
        sex: isCompany ? null : (newGuest.gender ?? null),
        customer_code: newGuest.customerCode ?? null,
        credit_limit: newGuest.creditLimit ?? null,
        sponsor_code: newGuest.sponsorCode ?? null,
        reference: newGuest.reference ?? null,
        status: true,
      });
    } catch (createErr) {
      const mapped = mapAggregateError(createErr);
      if (
        mapped.status === 504 ||
        mapped.status === 503 ||
        /timeout|unavailable/i.test(mapped.message)
      ) {
        const { searchCentralCustomers } = await import(
          "@/modules/sigesc-integration/customers/customers-service"
        );
        const searchTerm = newGuest.email || newGuest.phone || newGuest.nif;
        if (searchTerm) {
          const found = await searchCentralCustomers(prisma, authz.ctx, {
            search: searchTerm,
            per_page: 5,
          });
          const exact = (found.data ?? []).filter((c) => {
            if (newGuest.email && c.email?.toLowerCase() === newGuest.email.toLowerCase()) {
              return true;
            }
            if (newGuest.phone && c.phone === newGuest.phone) return true;
            if (newGuest.nif && c.nif === newGuest.nif) return true;
            return false;
          });
          if (exact.length === 1) {
            created = { customer: exact[0]! };
          } else {
            return NextResponse.json(
              {
                error:
                  "A criação no sistema central expirou ou foi ambígua. Pesquise o cliente antes de tentar novamente.",
                candidates: found.data ?? [],
                reconciliationRequired: true,
              },
              { status: 409 },
            );
          }
        } else {
          return NextResponse.json(
            {
              error:
                "A criação no sistema central expirou e não há email/telefone/NIF para reconciliar.",
              reconciliationRequired: true,
            },
            { status: 409 },
          );
        }
      } else {
        throw createErr;
      }
    }

    const guest = await createGuest(prisma, authz.ctx, {
      salutation: newGuest.salutation,
      firstName: newGuest.firstName,
      lastName: newGuest.lastName,
      customerType: newGuest.customerType ?? "individual",
      companyName: newGuest.companyName,
      nif: newGuest.nif,
      email: newGuest.email,
      phone: newGuest.phone,
      secondaryPhone: newGuest.secondaryPhone,
      birthDate: newGuest.birthDate,
      gender: newGuest.gender,
      nationality: newGuest.nationality,
      preferredLanguage: newGuest.preferredLanguage,
      address: newGuest.address,
      city: newGuest.city,
      province: newGuest.province,
      postalCode: newGuest.postalCode,
      country: newGuest.country,
      vipTier: newGuest.vipTier,
      dietaryRestrictions: newGuest.dietaryRestrictions,
      roomPreferences: newGuest.roomPreferences,
      emergencyContactName: newGuest.emergencyContactName,
      emergencyContactPhone: newGuest.emergencyContactPhone,
      marketingOptIn: newGuest.marketingOptIn,
      notes: newGuest.notes,
      document: newGuest.document,
      centralCustomerId: created.customer.id,
    });
    return NextResponse.json({ guest, customer: created.customer }, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    if (mapped.status !== 500) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return jsonError(err);
  }
}
