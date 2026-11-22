import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { createGuest, listGuests } from "@/modules/guests/guest-service";

const createSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  country: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  const authz = await requireTenant("guests.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;

  try {
    const guests = await listGuests(prisma, authz.ctx, { q });
    return NextResponse.json({ guests });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("guests.write");
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid guest payload" }, { status: 400 });
  }

  try {
    const guest = await createGuest(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ guest }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
