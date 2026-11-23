import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createRatePlan, listRatePlans } from "@/modules/rates/rates-service";

export async function GET(request: Request) {
  const authz = await requireTenant("rates.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const activeParam = url.searchParams.get("active");
  try {
    const result = await listRatePlans(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      active:
        activeParam === "1" || activeParam === "true"
          ? true
          : activeParam === "0" || activeParam === "false"
            ? false
            : undefined,
      take: url.searchParams.get("take")
        ? Number(url.searchParams.get("take"))
        : undefined,
      skip: url.searchParams.get("skip")
        ? Number(url.searchParams.get("skip"))
        : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  hotelId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(64),
  description: z.string().max(5000).optional(),
  baseAmount: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  weekdayOnly: z.boolean().optional(),
  weekendOnly: z.boolean().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  minStayNights: z.number().int().min(1).optional(),
  maxStayNights: z.number().int().min(1).nullable().optional(),
  includedOccupancy: z.number().int().min(1).optional(),
  extraGuestAmount: z.number().nonnegative().nullable().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("rates.write");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rate plan payload" }, { status: 400 });
  }
  try {
    const plan = await createRatePlan(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
