import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  bulkConvertCustomersToGuests,
  convertCustomerToGuest,
  MAX_CUSTOMER_TO_GUEST_BATCH,
} from "@/modules/sigesc-integration/guests/customer-to-guest-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const bodySchema = z.union([
  z.object({
    centralCustomerId: z.union([z.string(), z.number()]),
  }),
  z.object({
    centralCustomerIds: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(MAX_CUSTOMER_TO_GUEST_BATCH),
  }),
]);

export async function POST(request: Request) {
  // Need both guests.write and integrations.customers
  const authzCustomers = await requireTenant("integrations.customers");
  if (!authzCustomers.ok) return authzCustomers.response;
  const authzGuests = await requireTenant("guests.write");
  if (!authzGuests.ok) return authzGuests.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Invalid convert payload. Provide centralCustomerId or centralCustomerIds (max ${MAX_CUSTOMER_TO_GUEST_BATCH}).`,
      },
      { status: 400 },
    );
  }

  try {
    if ("centralCustomerIds" in parsed.data) {
      const batch = await bulkConvertCustomersToGuests(
        prisma,
        authzCustomers.ctx,
        parsed.data.centralCustomerIds,
      );
      return NextResponse.json(batch);
    }
    const result = await convertCustomerToGuest(
      prisma,
      authzCustomers.ctx,
      parsed.data.centralCustomerId,
    );
    const status = result.outcome === "converted" ? 201 : 200;
    return NextResponse.json({ result }, { status });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
