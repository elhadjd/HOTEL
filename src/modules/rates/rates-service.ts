import type { Prisma, PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

function isWeekendUtc(day: Date): boolean {
  const dow = day.getUTCDay();
  return dow === 0 || dow === 6;
}

async function assertHotel(prisma: PrismaClient, ctx: TenantContext, hotelId: string) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);
  return hotel;
}

function assertNonNegativeAmount(amount: number, label = "Amount") {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

export async function listRatePlans(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: {
    hotelId?: string;
    categoryId?: string;
    active?: boolean;
    q?: string;
    take?: number;
    skip?: number;
  },
) {
  const take = Math.min(Math.max(filters?.take ?? 50, 1), 200);
  const skip = Math.max(filters?.skip ?? 0, 0);
  const q = filters?.q?.trim();

  const where: Prisma.RatePlanWhereInput = {
    hotel: { institutionId: ctx.institutionId },
    ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters?.active != null ? { active: filters.active } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.ratePlan.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, code: true } },
        hotel: { select: { id: true, name: true, code: true } },
        seasonals: { orderBy: { startDate: "asc" } },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      take,
      skip,
    }),
    prisma.ratePlan.count({ where }),
  ]);

  return { rows, total, take, skip };
}

export async function getRatePlan(prisma: PrismaClient, ctx: TenantContext, id: string) {
  const plan = await prisma.ratePlan.findUnique({
    where: { id },
    include: {
      category: true,
      hotel: true,
      seasonals: { orderBy: { startDate: "asc" } },
      audits: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!plan) throw new Error("Rate plan not found");
  assertSameInstitution(ctx, plan.hotel.institutionId);
  return plan;
}

export async function createRatePlan(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    hotelId: string;
    categoryId: string;
    name: string;
    code: string;
    description?: string;
    baseAmount: number;
    currency?: string;
    weekdayOnly?: boolean;
    weekendOnly?: boolean;
    validFrom?: string | Date | null;
    validTo?: string | Date | null;
    minStayNights?: number;
    maxStayNights?: number | null;
    includedOccupancy?: number;
    extraGuestAmount?: number | null;
    priority?: number;
    active?: boolean;
  },
) {
  await assertHotel(prisma, ctx, input.hotelId);
  const category = await prisma.roomCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || category.hotelId !== input.hotelId) {
    throw new Error("Room category not found for hotel");
  }
  assertNonNegativeAmount(input.baseAmount, "Base amount");
  if (input.extraGuestAmount != null) {
    assertNonNegativeAmount(input.extraGuestAmount, "Extra guest amount");
  }
  if (input.weekdayOnly && input.weekendOnly) {
    throw new Error("Rate plan cannot be both weekday-only and weekend-only");
  }
  const minStay = input.minStayNights ?? 1;
  if (minStay < 1) throw new Error("Minimum stay must be at least 1 night");
  if (input.maxStayNights != null && input.maxStayNights < minStay) {
    throw new Error("Maximum stay cannot be less than minimum stay");
  }
  const validFrom = input.validFrom ? toDateOnlyUtc(input.validFrom) : null;
  const validTo = input.validTo ? toDateOnlyUtc(input.validTo) : null;
  if (validFrom && validTo && validTo < validFrom) {
    throw new Error("validTo must be on or after validFrom");
  }

  const plan = await prisma.ratePlan.create({
    data: {
      hotelId: input.hotelId,
      categoryId: input.categoryId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description?.trim() || null,
      baseAmount: input.baseAmount,
      currency: input.currency ?? "AOA",
      weekdayOnly: Boolean(input.weekdayOnly),
      weekendOnly: Boolean(input.weekendOnly),
      validFrom,
      validTo,
      minStayNights: minStay,
      maxStayNights: input.maxStayNights ?? null,
      includedOccupancy: input.includedOccupancy ?? 2,
      extraGuestAmount: input.extraGuestAmount ?? null,
      priority: input.priority ?? 0,
      active: input.active ?? true,
    },
    include: { category: true, hotel: true, seasonals: true },
  });

  await prisma.ratePlanAudit.create({
    data: {
      ratePlanId: plan.id,
      actorUserId: ctx.userId,
      action: "CREATE",
      afterJson: plan as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "RatePlan",
      entityId: plan.id,
      metadata: { code: plan.code, hotelId: plan.hotelId },
    },
  });
  return plan;
}

export async function updateRatePlan(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    baseAmount: number;
    weekdayOnly: boolean;
    weekendOnly: boolean;
    validFrom: string | Date | null;
    validTo: string | Date | null;
    minStayNights: number;
    maxStayNights: number | null;
    includedOccupancy: number;
    extraGuestAmount: number | null;
    priority: number;
    active: boolean;
  }>,
) {
  const existing = await getRatePlan(prisma, ctx, id);
  if (input.baseAmount != null) assertNonNegativeAmount(input.baseAmount, "Base amount");
  if (input.extraGuestAmount != null) {
    assertNonNegativeAmount(input.extraGuestAmount, "Extra guest amount");
  }
  const weekdayOnly = input.weekdayOnly ?? existing.weekdayOnly;
  const weekendOnly = input.weekendOnly ?? existing.weekendOnly;
  if (weekdayOnly && weekendOnly) {
    throw new Error("Rate plan cannot be both weekday-only and weekend-only");
  }

  const updated = await prisma.ratePlan.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.baseAmount != null ? { baseAmount: input.baseAmount } : {}),
      ...(input.weekdayOnly != null ? { weekdayOnly: input.weekdayOnly } : {}),
      ...(input.weekendOnly != null ? { weekendOnly: input.weekendOnly } : {}),
      ...(input.validFrom !== undefined
        ? { validFrom: input.validFrom ? toDateOnlyUtc(input.validFrom) : null }
        : {}),
      ...(input.validTo !== undefined
        ? { validTo: input.validTo ? toDateOnlyUtc(input.validTo) : null }
        : {}),
      ...(input.minStayNights != null ? { minStayNights: input.minStayNights } : {}),
      ...(input.maxStayNights !== undefined ? { maxStayNights: input.maxStayNights } : {}),
      ...(input.includedOccupancy != null
        ? { includedOccupancy: input.includedOccupancy }
        : {}),
      ...(input.extraGuestAmount !== undefined
        ? { extraGuestAmount: input.extraGuestAmount }
        : {}),
      ...(input.priority != null ? { priority: input.priority } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
    include: { category: true, hotel: true, seasonals: true },
  });

  await prisma.ratePlanAudit.create({
    data: {
      ratePlanId: id,
      actorUserId: ctx.userId,
      action: "UPDATE",
      beforeJson: {
        name: existing.name,
        baseAmount: Number(existing.baseAmount),
        active: existing.active,
        priority: existing.priority,
      },
      afterJson: {
        name: updated.name,
        baseAmount: Number(updated.baseAmount),
        active: updated.active,
        priority: updated.priority,
      },
    },
  });
  return updated;
}

export async function addSeasonalRate(
  prisma: PrismaClient,
  ctx: TenantContext,
  ratePlanId: string,
  input: {
    name: string;
    startDate: string | Date;
    endDate: string | Date;
    amount: number;
    minOccupancy?: number | null;
    weekendOnly?: boolean;
    weekdayOnly?: boolean;
  },
) {
  await getRatePlan(prisma, ctx, ratePlanId);
  assertNonNegativeAmount(input.amount, "Seasonal amount");
  const start = toDateOnlyUtc(input.startDate);
  const end = toDateOnlyUtc(input.endDate);
  if (end < start) throw new Error("Seasonal endDate must be on or after startDate");
  if (input.weekdayOnly && input.weekendOnly) {
    throw new Error("Seasonal rate cannot be both weekday-only and weekend-only");
  }

  // Overlap check within same plan
  const overlapping = await prisma.seasonalRate.findMany({
    where: {
      ratePlanId,
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  for (const o of overlapping) {
    const sameDayType =
      Boolean(o.weekendOnly) === Boolean(input.weekendOnly) &&
      Boolean(o.weekdayOnly) === Boolean(input.weekdayOnly);
    if (sameDayType) {
      throw new Error(
        `Seasonal period overlaps existing season "${o.name}" (${o.startDate.toISOString().slice(0, 10)}–${o.endDate.toISOString().slice(0, 10)})`,
      );
    }
  }

  const seasonal = await prisma.seasonalRate.create({
    data: {
      ratePlanId,
      name: input.name.trim(),
      startDate: start,
      endDate: end,
      amount: input.amount,
      minOccupancy: input.minOccupancy ?? null,
      weekendOnly: Boolean(input.weekendOnly),
      weekdayOnly: Boolean(input.weekdayOnly),
    },
  });
  await prisma.ratePlanAudit.create({
    data: {
      ratePlanId,
      actorUserId: ctx.userId,
      action: "SEASONAL_ADD",
      afterJson: seasonal as unknown as Prisma.InputJsonValue,
    },
  });
  return seasonal;
}

export async function deleteSeasonalRate(
  prisma: PrismaClient,
  ctx: TenantContext,
  seasonalId: string,
) {
  const seasonal = await prisma.seasonalRate.findUnique({
    where: { id: seasonalId },
    include: { ratePlan: { include: { hotel: true } } },
  });
  if (!seasonal) throw new Error("Seasonal rate not found");
  assertSameInstitution(ctx, seasonal.ratePlan.hotel.institutionId);
  await prisma.seasonalRate.delete({ where: { id: seasonalId } });
  await prisma.ratePlanAudit.create({
    data: {
      ratePlanId: seasonal.ratePlanId,
      actorUserId: ctx.userId,
      action: "SEASONAL_DELETE",
      beforeJson: { id: seasonal.id, name: seasonal.name },
    },
  });
}

export type NightQuote = {
  date: string;
  amount: number;
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  source: "base" | "seasonal";
  seasonalName?: string;
  reason: string;
};

export type QuoteRatePlanInput = {
  id: string;
  code: string;
  name: string;
  baseAmount: number | Prisma.Decimal;
  currency: string;
  weekdayOnly: boolean;
  weekendOnly: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  minStayNights: number;
  maxStayNights: number | null;
  includedOccupancy: number;
  extraGuestAmount: number | Prisma.Decimal | null;
  priority: number;
  seasonals: Array<{
    name: string;
    startDate: Date;
    endDate: Date;
    amount: number | Prisma.Decimal;
    minOccupancy: number | null;
    weekendOnly: boolean;
    weekdayOnly: boolean;
  }>;
};

/**
 * Pure accommodation quote engine — evaluates active plans night-by-night,
 * enforces `SeasonalRate.minOccupancy`, extra-guest fees, and min/max stay nights.
 */
export function computeAccommodationQuote(
  plans: QuoteRatePlanInput[],
  input: {
    arrival: Date;
    departure: Date;
    occupants?: number;
  },
) {
  const { arrival, departure } = input;
  if (departure <= arrival) throw new Error("Departure must be after arrival");
  const totalNights = Math.round((departure.getTime() - arrival.getTime()) / 86_400_000);
  if (totalNights > 366) {
    throw new Error("Accommodation quote cannot exceed 366 nights");
  }

  const nights: NightQuote[] = [];
  const cursor = new Date(arrival);
  while (cursor < departure) {
    const day = new Date(cursor);
    const weekend = isWeekendUtc(day);
    const candidates = plans.filter((p) => {
      if (p.validFrom && day < p.validFrom) return false;
      if (p.validTo && day > p.validTo) return false;
      if (p.weekdayOnly && weekend) return false;
      if (p.weekendOnly && !weekend) return false;
      return true;
    });
    if (!candidates.length) {
      throw new Error(
        `No active rate plan covers ${day.toISOString().slice(0, 10)} for this category`,
      );
    }
    const plan = candidates[0]!;
    const occupants = input.occupants ?? plan.includedOccupancy;
    const seasonal = plan.seasonals.find((s) => {
      if (day < s.startDate || day > s.endDate) return false;
      if (s.weekdayOnly && weekend) return false;
      if (s.weekendOnly && !weekend) return false;
      if (s.minOccupancy != null && occupants < s.minOccupancy) return false;
      return true;
    });
    let amount = seasonal ? Number(seasonal.amount) : Number(plan.baseAmount);
    const extras = Math.max(0, occupants - plan.includedOccupancy);
    if (extras > 0 && plan.extraGuestAmount != null) {
      amount += extras * Number(plan.extraGuestAmount);
    }
    nights.push({
      date: day.toISOString().slice(0, 10),
      amount: Number(amount.toFixed(2)),
      ratePlanId: plan.id,
      ratePlanCode: plan.code,
      ratePlanName: plan.name,
      source: seasonal ? "seasonal" : "base",
      seasonalName: seasonal?.name,
      reason: seasonal
        ? `Seasonal "${seasonal.name}" on plan ${plan.code} (priority ${plan.priority})`
        : `Base amount on plan ${plan.code} (priority ${plan.priority})`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const stayNights = nights.length;
  const usedPlanIds = [...new Set(nights.map((n) => n.ratePlanId))];
  for (const planId of usedPlanIds) {
    const usedPlan = plans.find((p) => p.id === planId);
    if (!usedPlan) continue;
    if (stayNights < usedPlan.minStayNights) {
      throw new Error(`Minimum stay is ${usedPlan.minStayNights} night(s)`);
    }
    if (usedPlan.maxStayNights != null && stayNights > usedPlan.maxStayNights) {
      throw new Error(`Maximum stay is ${usedPlan.maxStayNights} night(s)`);
    }
  }

  const primaryPlan = plans.find((p) => p.id === nights[0]?.ratePlanId);
  const subtotal = Number(nights.reduce((s, n) => s + n.amount, 0).toFixed(2));
  return {
    currency: primaryPlan?.currency ?? "AOA",
    nights,
    nightCount: stayNights,
    subtotal,
    note: "Operational accommodation quote — not a SIGESC fiscal document",
  };
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Resolve accommodation amount for a stay range.
 * Selection order for each night:
 * 1. Active plans for hotel+category covering validity
 * 2. Match weekday/weekend constraints
 * 3. Prefer highest priority, then most recently updated as tie-break
 * 4. Seasonal override when date falls in a matching seasonal window and satisfies minOccupancy
 * Extra guests beyond includedOccupancy add extraGuestAmount per night.
 */
export async function quoteAccommodation(
  prisma: Db,
  ctx: TenantContext,
  input: {
    hotelId: string;
    categoryId: string;
    arrivalDate: string | Date;
    departureDate: string | Date;
    occupants?: number;
  },
) {
  const hotel = await prisma.hotel.findUnique({ where: { id: input.hotelId } });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);

  const arrival = toDateOnlyUtc(input.arrivalDate);
  const departure = toDateOnlyUtc(input.departureDate);
  if (departure <= arrival) throw new Error("Departure must be after arrival");
  const totalNights = Math.round((departure.getTime() - arrival.getTime()) / 86_400_000);
  if (totalNights > 366) {
    throw new Error("Accommodation quote cannot exceed 366 nights");
  }

  const plans = await prisma.ratePlan.findMany({
    where: {
      hotelId: input.hotelId,
      categoryId: input.categoryId,
      active: true,
      hotel: { institutionId: ctx.institutionId },
    },
    include: { seasonals: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  return computeAccommodationQuote(plans, {
    arrival,
    departure,
    occupants: input.occupants,
  });
}
