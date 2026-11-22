import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createCentralCustomerFromGuest,
  linkGuestToCentralCustomer,
  unlinkGuestFromCentralCustomer,
} from "@/modules/sigesc-integration/customers/customers-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const linkSchema = z.object({
  action: z.literal("link"),
  centralCustomerId: z.union([z.string(), z.number()]),
});

const createSchema = z.object({
  action: z.literal("create"),
  forceCreate: z.boolean().optional(),
});

const unlinkSchema = z.object({
  action: z.literal("unlink"),
});

const bodySchema = z.discriminatedUnion("action", [linkSchema, createSchema, unlinkSchema]);

export async function POST(
  request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const authz = await requireTenant("integrations.customers");
  if (!authz.ok) return authz.response;
  const { guestId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mapping action" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "link") {
      const mapping = await linkGuestToCentralCustomer(
        prisma,
        authz.ctx,
        guestId,
        parsed.data.centralCustomerId,
      );
      return NextResponse.json({ mapping });
    }
    if (parsed.data.action === "unlink") {
      const mapping = await unlinkGuestFromCentralCustomer(prisma, authz.ctx, guestId);
      return NextResponse.json({ mapping });
    }
    const result = await createCentralCustomerFromGuest(prisma, authz.ctx, guestId, {
      forceCreate: parsed.data.forceCreate,
    });
    return NextResponse.json(result, { status: result.needsConfirmation ? 200 : 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
