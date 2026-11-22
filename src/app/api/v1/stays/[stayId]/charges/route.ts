import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  addStayCharge,
  summarizeStayAccount,
  voidStayCharge,
} from "@/modules/stays/stay-account-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stay_accounts.read");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  try {
    const summary = await summarizeStayAccount(prisma, authz.ctx, stayId);
    return NextResponse.json(summary);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  action: z.literal("add").optional(),
  kind: z.enum(["ACCOMMODATION", "EXTRA_SERVICE", "PRODUCT", "FEE", "DISCOUNT", "ADJUSTMENT"]).optional(),
  description: z.string().min(1).max(255),
  quantity: z.number().positive().optional(),
  mappingLocalCode: z.string().min(1).optional(),
  manualUnitPrice: z.number().optional(),
});

const voidSchema = z.object({
  action: z.literal("void"),
  chargeId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stay_accounts.manage");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof json === "object" && json && (json as { action?: string }).action === "void") {
    const parsed = voidSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid void payload" }, { status: 400 });
    }
    try {
      const charge = await voidStayCharge(
        prisma,
        authz.ctx,
        parsed.data.chargeId,
        parsed.data.reason,
      );
      return NextResponse.json({ charge });
    } catch (err) {
      return jsonError(err);
    }
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid charge payload" }, { status: 400 });
  }
  try {
    const charge = await addStayCharge(prisma, authz.ctx, stayId, parsed.data);
    return NextResponse.json({ charge }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
