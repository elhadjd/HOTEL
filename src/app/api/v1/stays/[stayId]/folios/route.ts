import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { assertPermission } from "@/modules/tenancy/tenant";
import {
  assignChargeToFolio,
  createStayFolio,
  emitFolioInvoiceToSigesc,
  listStayFolios,
  updateFolioDeposit,
} from "@/modules/stays/folio-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stay_accounts.read");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  try {
    const folios = await listStayFolios(prisma, authz.ctx, stayId);
    return NextResponse.json({ folios });
  } catch (err) {
    return jsonError(err);
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(120),
    folioType: z.enum(["GUEST", "COMPANY", "AGENCY", "EXTRAS"]).optional(),
    payerGuestId: z.string().uuid().nullable().optional(),
    depositAmount: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("assign"),
    chargeId: z.string().uuid(),
    folioId: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("deposit"),
    folioId: z.string().uuid(),
    depositAmount: z.number().min(0),
  }),
  z.object({
    action: z.literal("emit_sigesc"),
    folioId: z.string().uuid().nullable(),
    state: z.enum(["Proforma", "Cotação"]).optional(),
  }),
]);

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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid folio payload" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "create") {
      const folio = await createStayFolio(prisma, authz.ctx, stayId, parsed.data);
      return NextResponse.json({ folio }, { status: 201 });
    }
    if (parsed.data.action === "assign") {
      const charge = await assignChargeToFolio(
        prisma,
        authz.ctx,
        stayId,
        parsed.data.chargeId,
        parsed.data.folioId,
      );
      return NextResponse.json({ charge });
    }
    if (parsed.data.action === "deposit") {
      const folio = await updateFolioDeposit(
        prisma,
        authz.ctx,
        stayId,
        parsed.data.folioId,
        parsed.data.depositAmount,
      );
      return NextResponse.json({ folio });
    }

    assertPermission(authz.ctx, "integrations.invoices");
    const result = await emitFolioInvoiceToSigesc(
      prisma,
      authz.ctx,
      stayId,
      parsed.data.folioId,
      parsed.data.state ?? "Proforma",
    );
    return NextResponse.json(result, {
      status: result.reconciliationRequired ? 202 : 200,
    });
  } catch (err) {
    return jsonError(err);
  }
}
