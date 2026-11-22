import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { completeCheckOut, prepareCheckOut } from "@/modules/stays/check-out-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.checkout");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  try {
    const prep = await prepareCheckOut(prisma, authz.ctx, stayId);
    return NextResponse.json(prep);
  } catch (err) {
    return jsonError(err);
  }
}

const bodySchema = z.object({
  notes: z.string().max(2000).optional(),
  requestProforma: z.boolean().optional(),
  allowFinancialPending: z.boolean().optional(),
  mappingLocalCodes: z
    .array(
      z.object({
        mappingLocalCode: z.string().min(1),
        quantity: z.number().positive(),
      }),
    )
    .max(50)
    .optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.checkout");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-out payload" }, { status: 400 });
  }
  try {
    const result = await completeCheckOut(prisma, authz.ctx, stayId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
