import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { assertGuestLinkedForOperations } from "@/modules/guests/guest-service";
import {
  createInvoiceDraft,
  submitInvoice,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { getStay } from "./stay-service";

export type FolioType = "GUEST" | "COMPANY" | "AGENCY" | "EXTRAS";

export type FolioBalanceSummary = {
  chargesTotal: number;
  depositAmount: number;
  balanceDue: number;
};

/** Pure balance calculation for a stay folio (operational estimate only). */
export function computeFolioBalance(params: {
  lines: Array<{ unitPrice: number; quantity: number }>;
  depositAmount: number;
}): FolioBalanceSummary {
  const chargesTotal = Number(
    params.lines
      .reduce((sum, l) => sum + Number(l.unitPrice) * Number(l.quantity), 0)
      .toFixed(2),
  );
  const depositAmount = Number(Math.max(0, params.depositAmount).toFixed(2));
  const balanceDue = Number((chargesTotal - depositAmount).toFixed(2));
  return { chargesTotal, depositAmount, balanceDue };
}

export async function listStayFolios(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
) {
  await getStay(prisma, ctx, stayId);
  return prisma.stayFolio.findMany({
    where: { stayId, institutionId: ctx.institutionId },
    include: {
      payerGuest: {
        include: { customerMapping: true },
      },
      charges: {
        where: { status: { not: "VOIDED" } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createStayFolio(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  input: {
    name: string;
    folioType?: FolioType;
    payerGuestId?: string | null;
    depositAmount?: number;
    notes?: string;
  },
) {
  const stay = await getStay(prisma, ctx, stayId);
  if (!["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status)) {
    throw new Error("Folios can only be created on an active stay");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Folio name is required");

  if (input.payerGuestId) {
    await assertGuestLinkedForOperations(prisma, ctx, input.payerGuestId);
  }
  const deposit = input.depositAmount ?? 0;
  if (!Number.isFinite(deposit) || deposit < 0) {
    throw new Error("Deposit amount must be non-negative");
  }

  const folio = await prisma.stayFolio.create({
    data: {
      stayId,
      institutionId: ctx.institutionId,
      name: name.slice(0, 120),
      folioType: input.folioType ?? "GUEST",
      payerGuestId: input.payerGuestId ?? null,
      depositAmount: deposit,
      notes: input.notes?.trim().slice(0, 500) || null,
    },
    include: {
      payerGuest: { include: { customerMapping: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "StayFolio",
      entityId: folio.id,
      metadata: {
        stayId,
        name: folio.name,
        folioType: folio.folioType,
        payerGuestId: folio.payerGuestId,
        depositAmount: deposit,
      },
    },
  });

  return folio;
}

export async function assignChargeToFolio(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  chargeId: string,
  folioId: string | null,
) {
  await getStay(prisma, ctx, stayId);

  const charge = await prisma.stayAccountCharge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.institutionId !== ctx.institutionId || charge.stayId !== stayId) {
    throw new Error("Charge not found on this stay");
  }
  if (charge.status === "HANDED_OFF") {
    throw new Error("Cannot move a charge already handed off to SIGESC");
  }
  if (charge.status === "VOIDED") {
    throw new Error("Cannot move a voided charge");
  }

  if (folioId) {
    const folio = await prisma.stayFolio.findUnique({ where: { id: folioId } });
    if (!folio || folio.institutionId !== ctx.institutionId || folio.stayId !== stayId) {
      throw new Error("Target folio not found on this stay");
    }
  }

  return prisma.stayAccountCharge.update({
    where: { id: chargeId },
    data: { folioId },
  });
}

export async function updateFolioDeposit(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  folioId: string,
  depositAmount: number,
) {
  await getStay(prisma, ctx, stayId);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    throw new Error("Deposit amount must be non-negative");
  }
  const folio = await prisma.stayFolio.findUnique({ where: { id: folioId } });
  if (!folio || folio.institutionId !== ctx.institutionId || folio.stayId !== stayId) {
    throw new Error("Folio not found on this stay");
  }

  const updated = await prisma.stayFolio.update({
    where: { id: folioId },
    data: { depositAmount },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "StayFolioDeposit",
      entityId: folioId,
      metadata: {
        stayId,
        previousDeposit: Number(folio.depositAmount),
        depositAmount,
      },
    },
  });

  return updated;
}

/**
 * Emits a dedicated Cotação or Proforma in SIGESC Central for a specific folio
 * (enabling split billing: e.g., accommodation billed to corporate client, extras billed to guest).
 */
export async function emitFolioInvoiceToSigesc(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
  folioId: string | null,
  state: "Cotação" | "Proforma" = "Proforma",
) {
  const stay = await getStay(prisma, ctx, stayId);

  let payerGuestId = stay.guestId;
  let folioLabel = "Conta Principal";

  if (folioId) {
    const folio = await prisma.stayFolio.findUnique({ where: { id: folioId } });
    if (!folio || folio.institutionId !== ctx.institutionId || folio.stayId !== stayId) {
      throw new Error("Folio not found on this stay");
    }
    payerGuestId = folio.payerGuestId ?? stay.guestId;
    folioLabel = folio.name;
  }

  const unbilledCharges = await prisma.stayAccountCharge.findMany({
    where: {
      stayId,
      institutionId: ctx.institutionId,
      folioId: folioId ?? null,
      status: "CONFIRMED",
      catalogMappingId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  if (unbilledCharges.length === 0) {
    throw new Error("No unbilled SIGESC-mapped charges in this folio");
  }

  const mappingIds = [
    ...new Set(
      unbilledCharges.map((c) => c.catalogMappingId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const mappings = await prisma.productCatalogMapping.findMany({
    where: { institutionId: ctx.institutionId, id: { in: mappingIds }, active: true },
    select: { id: true, localCode: true },
  });
  const codeById = new Map(mappings.map((m) => [m.id, m.localCode] as const));

  const lines = unbilledCharges
    .map((c) => {
      const code = c.catalogMappingId ? codeById.get(c.catalogMappingId) : undefined;
      if (!code) return null;
      return {
        mappingLocalCode: code,
        quantity: Number(c.quantity),
        description: c.description,
      };
    })
    .filter((x): x is { mappingLocalCode: string; quantity: number; description: string } =>
      Boolean(x),
    );

  if (lines.length === 0) {
    throw new Error("Selected charges do not have active SIGESC catalog mappings");
  }

  const draft = await createInvoiceDraft(prisma, ctx, {
    guestId: payerGuestId,
    reservationId: stay.reservationId,
    stayId: stay.id,
    hotelId: stay.hotelId,
    state,
    lines,
    notes: `Folio "${folioLabel}" · Estadia ${stay.id} · Quarto ${stay.room.code}`,
  });

  const submitted = await submitInvoice(prisma, ctx, draft.id);
  const chargeIds = unbilledCharges.map((c) => c.id);

  if (submitted.status === "CREATED") {
    await prisma.stayAccountCharge.updateMany({
      where: { id: { in: chargeIds }, status: "CONFIRMED" },
      data: { status: "HANDED_OFF", invoiceIntegrationId: submitted.id },
    });
    return {
      invoice: submitted,
      reconciliationRequired: false,
      message: `${state} do folio "${folioLabel}" confirmada no SIGESC (${submitted.saleKey ?? submitted.externalId}).`,
    };
  }

  await prisma.stayAccountCharge.updateMany({
    where: { id: { in: chargeIds }, status: "CONFIRMED" },
    data: { invoiceIntegrationId: submitted.id },
  });

  return {
    invoice: submitted,
    reconciliationRequired: submitted.status === "RECONCILIATION_REQUIRED",
    message: `Envio do folio "${folioLabel}" ficou em estado ${submitted.status} — verifique/reconcilie no SIGESC.`,
  };
}
