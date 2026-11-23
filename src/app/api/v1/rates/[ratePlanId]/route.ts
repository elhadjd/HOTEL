import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  addSeasonalRate,
  deleteSeasonalRate,
  getRatePlan,
  updateRatePlan,
} from "@/modules/rates/rates-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ratePlanId: string }> },
) {
  const authz = await requireTenant("rates.read");
  if (!authz.ok) return authz.response;
  const { ratePlanId } = await context.params;
  try {
    const plan = await getRatePlan(prisma, authz.ctx, ratePlanId);
    return NextResponse.json({ plan });
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).nullable().optional(),
  baseAmount: z.number().nonnegative().optional(),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ratePlanId: string }> },
) {
  const authz = await requireTenant("rates.write");
  if (!authz.ok) return authz.response;
  const { ratePlanId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rate plan update" }, { status: 400 });
  }
  try {
    const plan = await updateRatePlan(prisma, authz.ctx, ratePlanId, parsed.data);
    return NextResponse.json({ plan });
  } catch (err) {
    return jsonError(err);
  }
}

const seasonalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addSeasonal"),
    name: z.string().min(1).max(120),
    startDate: z.string().min(8),
    endDate: z.string().min(8),
    amount: z.number().nonnegative(),
    minOccupancy: z.number().int().min(1).nullable().optional(),
    weekendOnly: z.boolean().optional(),
    weekdayOnly: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("deleteSeasonal"),
    seasonalId: z.string().uuid(),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ ratePlanId: string }> },
) {
  const authz = await requireTenant("rates.write");
  if (!authz.ok) return authz.response;
  const { ratePlanId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = seasonalSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid seasonal action" }, { status: 400 });
  }
  try {
    if (parsed.data.action === "addSeasonal") {
      const seasonal = await addSeasonalRate(prisma, authz.ctx, ratePlanId, parsed.data);
      return NextResponse.json({ seasonal }, { status: 201 });
    }
    await deleteSeasonalRate(prisma, authz.ctx, parsed.data.seasonalId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
