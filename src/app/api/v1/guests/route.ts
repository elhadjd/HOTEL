import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createGuest, listGuests } from "@/modules/guests/guest-service";
import { createCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const createSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing_customer"),
    centralCustomerId: z.union([z.string(), z.number()]),
    firstName: z.string().min(1).max(120).optional(),
    lastName: z.string().min(1).max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("new_customer"),
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    nif: z.string().max(64).optional(),
  }),
]);

export async function GET(request: Request) {
  const authz = await requireTenant("guests.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const linkedOnly = url.searchParams.get("linkedOnly") === "1";

  try {
    const guests = await listGuests(prisma, authz.ctx, { q, linkedOnly });
    return NextResponse.json({ guests });
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
          "Invalid guest payload. Provide mode=existing_customer with centralCustomerId, or mode=new_customer.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.mode === "existing_customer") {
      if (!parsed.data.centralCustomerId) {
        return NextResponse.json(
          { error: "centralCustomerId is required" },
          { status: 400 },
        );
      }
      // Names optional — filled from central customer when omitted
      const customerModule = await import(
        "@/modules/sigesc-integration/customers/customers-service"
      );
      const customer = await customerModule.getCentralCustomer(
        prisma,
        authz.ctx,
        parsed.data.centralCustomerId,
      );
      const guest = await createGuest(prisma, authz.ctx, {
        firstName: parsed.data.firstName?.trim() || customer.name,
        lastName:
          parsed.data.lastName?.trim() ||
          customer.surname ||
          (customer.full_name?.split(/\s+/).slice(1).join(" ") || "—"),
        email: parsed.data.email,
        phone: parsed.data.phone,
        country: parsed.data.country,
        notes: parsed.data.notes,
        centralCustomerId: customer.id,
      });
      return NextResponse.json({ guest }, { status: 201 });
    }

    // Workflow B — create central customer first, then guest.
    // On Aggregate timeout: do not blind-retry create; search first, then block if ambiguous.
    const newGuest = parsed.data; // narrowed: mode === "new_customer"
    let created;
    try {
      created = await createCentralCustomer(prisma, authz.ctx, {
        name: newGuest.firstName,
        surname: newGuest.lastName,
        email: newGuest.email ?? null,
        phone: newGuest.phone ?? null,
        nif: newGuest.nif ?? null,
      });
    } catch (createErr) {
      const mapped = mapAggregateError(createErr);
      if (mapped.status === 504 || mapped.status === 503 || /timeout|unavailable/i.test(mapped.message)) {
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
                  "Central customer creation timed out or was ambiguous. Search SIGESC Central before retrying — do not create again blindly.",
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
                "Central customer creation timed out and no email/phone/NIF is available to reconcile. Guest was not created.",
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
      firstName: newGuest.firstName,
      lastName: newGuest.lastName,
      email: newGuest.email,
      phone: newGuest.phone,
      country: newGuest.country,
      notes: newGuest.notes,
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
