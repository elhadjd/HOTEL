import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { getGuest, updateGuest } from "@/modules/guests/guest-service";
import { updateCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
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

const patchSchema = z.object({
  salutation: z.string().max(32).optional().nullable(),
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
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
  vipTier: z.string().max(32).optional().nullable(),
  dietaryRestrictions: z.string().max(255).optional().nullable(),
  roomPreferences: z.string().max(255).optional().nullable(),
  emergencyContactName: z.string().max(120).optional().nullable(),
  emergencyContactPhone: z.string().max(40).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
  document: documentSchema,
  syncToCentral: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const authz = await requireTenant("guests.read");
  if (!authz.ok) return authz.response;
  const { guestId } = await context.params;
  try {
    const guest = await getGuest(prisma, authz.ctx, guestId);
    return NextResponse.json({ guest });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const authz = await requireTenant("guests.write");
  if (!authz.ok) return authz.response;
  const { guestId } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados de actualização inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { syncToCentral, ...fields } = parsed.data;
    const guest = await updateGuest(prisma, authz.ctx, guestId, fields);

    let centralSynced = false;
    let centralSyncWarning: string | null = null;

    if (syncToCentral && guest.customerMapping?.externalCustomerId) {
      const custAuthz = await requireTenant("integrations.customers");
      if (custAuthz.ok) {
        try {
          const isCompany = guest.customerType === "company";
          await updateCentralCustomer(
            prisma,
            custAuthz.ctx,
            guest.customerMapping.externalCustomerId,
            {
              name: isCompany && guest.companyName ? guest.companyName : guest.firstName,
              surname: isCompany ? null : guest.lastName,
              customer_type: guest.customerType,
              email: guest.email,
              phone: guest.phone,
              nif: guest.nif,
              address: guest.address,
              city: guest.city,
              province: guest.province,
              birth_date:
                !isCompany && guest.birthDate ? guest.birthDate.toISOString().slice(0, 10) : null,
              sex: isCompany ? null : guest.gender,
            },
          );
          centralSynced = true;
        } catch (syncErr) {
          centralSyncWarning = mapAggregateError(syncErr).message;
        }
      }
    }

    return NextResponse.json({ guest, centralSynced, centralSyncWarning });
  } catch (err) {
    const mapped = mapAggregateError(err);
    if (mapped.status !== 500) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return jsonError(err);
  }
}
