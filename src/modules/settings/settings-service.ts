import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { assertSameInstitution } from "@/modules/tenancy/tenant";

export async function getInstitutionSettings(prisma: PrismaClient, ctx: TenantContext) {
  const institution = await prisma.institution.findUnique({
    where: { id: ctx.institutionId },
    include: {
      aggregateConnection: {
        select: {
          id: true,
          host: true,
          keyPrefix: true,
          status: true,
          lastOnboardingAt: true,
          lastUsersSyncAt: true,
          lastCustomersSyncAt: true,
          lastError: true,
        },
      },
      hotels: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          code: true,
          settings: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!institution) throw new Error("Institution not found");
  return institution;
}

export async function updateInstitutionProfile(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    country?: string | null;
    street?: string | null;
    timezone?: string;
    currency?: string;
    locale?: string;
  },
) {
  const updated = await prisma.institution.update({
    where: { id: ctx.institutionId },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.city !== undefined ? { city: input.city?.trim() || null } : {}),
      ...(input.country !== undefined ? { country: input.country?.trim() || null } : {}),
      ...(input.street !== undefined ? { street: input.street?.trim() || null } : {}),
      ...(input.timezone != null ? { timezone: input.timezone.trim() } : {}),
      ...(input.currency != null ? { currency: input.currency.trim().toUpperCase() } : {}),
      ...(input.locale != null ? { locale: input.locale.trim() } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "Institution",
      entityId: updated.id,
      metadata: { fields: Object.keys(input) },
    },
  });

  return updated;
}

export async function updateHotelSettings(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId: string,
  input: {
    checkInTime?: string;
    checkOutTime?: string;
    earlyCheckInFrom?: string;
    lateCheckOutUntil?: string;
    housekeepingTurnaroundMinutes?: number;
    noShowCutoffTime?: string;
    timezone?: string;
    currency?: string;
    locale?: string;
    maxStayNights?: number | null;
    allowChildren?: boolean;
  },
) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);

  const settings = await prisma.hotelSettings.upsert({
    where: { hotelId },
    create: {
      hotelId,
      checkInTime: input.checkInTime ?? "14:00",
      checkOutTime: input.checkOutTime ?? "12:00",
      earlyCheckInFrom: input.earlyCheckInFrom ?? "10:00",
      lateCheckOutUntil: input.lateCheckOutUntil ?? "18:00",
      housekeepingTurnaroundMinutes: input.housekeepingTurnaroundMinutes ?? 60,
      noShowCutoffTime: input.noShowCutoffTime ?? "23:59",
      timezone: input.timezone ?? "Africa/Luanda",
      currency: input.currency ?? "AOA",
      locale: input.locale ?? "pt",
      maxStayNights: input.maxStayNights ?? null,
      allowChildren: input.allowChildren ?? true,
    },
    update: {
      ...(input.checkInTime != null ? { checkInTime: input.checkInTime } : {}),
      ...(input.checkOutTime != null ? { checkOutTime: input.checkOutTime } : {}),
      ...(input.earlyCheckInFrom != null ? { earlyCheckInFrom: input.earlyCheckInFrom } : {}),
      ...(input.lateCheckOutUntil != null ? { lateCheckOutUntil: input.lateCheckOutUntil } : {}),
      ...(input.housekeepingTurnaroundMinutes != null
        ? { housekeepingTurnaroundMinutes: input.housekeepingTurnaroundMinutes }
        : {}),
      ...(input.noShowCutoffTime != null ? { noShowCutoffTime: input.noShowCutoffTime } : {}),
      ...(input.timezone != null ? { timezone: input.timezone } : {}),
      ...(input.currency != null ? { currency: input.currency } : {}),
      ...(input.locale != null ? { locale: input.locale } : {}),
      ...(input.maxStayNights !== undefined ? { maxStayNights: input.maxStayNights } : {}),
      ...(input.allowChildren != null ? { allowChildren: input.allowChildren } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "HotelSettings",
      entityId: settings.id,
      metadata: { hotelId },
    },
  });

  return settings;
}
