import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  getCentralCustomer,
  updateCentralCustomer,
} from "@/modules/sigesc-integration/customers/customers-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const updateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    surname: z.string().max(255).optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    nif: z.string().max(64).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    province: z.string().max(120).optional().nullable(),
    country_id: z.number().int().positive().optional().nullable(),
    customer_code: z.string().max(64).optional().nullable(),
    customer_type: z.string().max(64).optional().nullable(),
    credit_limit: z.number().nonnegative().optional().nullable(),
    birth_date: z.string().max(32).optional().nullable(),
    sex: z.string().max(32).optional().nullable(),
    status: z.union([z.boolean(), z.string()]).optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.customers");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  try {
    const customer = await getCentralCustomer(prisma, authz.ctx, id);
    return NextResponse.json({ customer });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

async function handleUpdate(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authz = await requireTenant("integrations.customers");
  if (!authz.ok) return authz.response;
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  try {
    const result = await updateCentralCustomer(prisma, authz.ctx, id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export const PATCH = handleUpdate;
export const PUT = handleUpdate;
