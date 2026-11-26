import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import {
  createCentralCustomer,
  searchCentralCustomers,
} from "@/modules/sigesc-integration/customers/customers-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  surname: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  nif: z.string().max(64).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  province: z.string().max(120).optional().nullable(),
  country_id: z.number().int().positive().optional().nullable(),
  customer_type: z.enum(["individual", "company"]).or(z.string().max(64)).optional().nullable(),
  customer_code: z.string().max(64).optional().nullable(),
  sponsor_code: z.string().max(64).optional().nullable(),
  sponsor_id: z.number().int().positive().optional().nullable(),
  credit_limit: z.number().nonnegative().optional().nullable(),
  terms_payment_id: z.number().int().positive().optional().nullable(),
  birth_date: z.string().max(32).optional().nullable(),
  sex: z.string().max(32).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  status: z.union([z.boolean(), z.string()]).optional(),
});

export async function GET(request: Request) {
  const authz = await requireTenant("integrations.customers");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const result = await searchCentralCustomers(prisma, authz.ctx, {
      search: url.searchParams.get("search") ?? url.searchParams.get("q") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
      per_page: url.searchParams.get("per_page")
        ? Number(url.searchParams.get("per_page"))
        : undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      direction: url.searchParams.get("direction") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.customers");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid customer payload" }, { status: 400 });
  }
  try {
    const result = await createCentralCustomer(prisma, authz.ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
