import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  getInstitutionSettings,
  updateHotelSettings,
  updateInstitutionProfile,
} from "@/modules/settings/settings-service";

export async function GET() {
  const authz = await requireTenant("settings.write");
  if (!authz.ok) {
    // Allow managers with staff.read to view a read-only snapshot via hotel_admin/manager
    const read = await requireTenant("staff.read");
    if (!read.ok) return authz.response;
    try {
      const settings = await getInstitutionSettings(prisma, read.ctx);
      return NextResponse.json({ settings, readOnly: true });
    } catch (err) {
      return jsonError(err);
    }
  }
  try {
    const settings = await getInstitutionSettings(prisma, authz.ctx);
    return NextResponse.json({ settings, readOnly: false });
  } catch (err) {
    return jsonError(err);
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateInstitution"),
    name: z.string().min(2).max(255).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(64).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    country: z.string().max(120).nullable().optional(),
    street: z.string().max(255).nullable().optional(),
    timezone: z.string().max(64).optional(),
    currency: z.string().length(3).optional(),
    locale: z.string().max(8).optional(),
  }),
  z.object({
    action: z.literal("updateHotelSettings"),
    hotelId: z.string().uuid(),
    checkInTime: z.string().max(8).optional(),
    checkOutTime: z.string().max(8).optional(),
    earlyCheckInFrom: z.string().max(8).optional(),
    lateCheckOutUntil: z.string().max(8).optional(),
    housekeepingTurnaroundMinutes: z.number().int().min(0).max(480).optional(),
    noShowCutoffTime: z.string().max(8).optional(),
    timezone: z.string().max(64).optional(),
    currency: z.string().length(3).optional(),
    locale: z.string().max(8).optional(),
    maxStayNights: z.number().int().min(1).nullable().optional(),
    allowChildren: z.boolean().optional(),
  }),
]);

export async function POST(request: Request) {
  const authz = await requireTenant("settings.write");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }
  try {
    if (parsed.data.action === "updateInstitution") {
      const { action, ...rest } = parsed.data;
      void action;
      const institution = await updateInstitutionProfile(prisma, authz.ctx, rest);
      return NextResponse.json({ institution });
    }
    const { action, hotelId, ...rest } = parsed.data;
    void action;
    const settings = await updateHotelSettings(prisma, authz.ctx, hotelId, rest);
    return NextResponse.json({ settings });
  } catch (err) {
    return jsonError(err);
  }
}
