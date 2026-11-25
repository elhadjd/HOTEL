import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { addStayCharge } from "./stay-account-service";
import { getStay } from "./stay-service";
import {
  addItemsToInvoice,
  createInvoiceDraft,
  findEligibleInvoiceForStay,
  isEditableCentralState,
  submitInvoice,
} from "@/modules/sigesc-integration/invoices/invoice-service";

export type ConsumptionLineInput = {
  mappingLocalCode: string;
  quantity: number;
  discount?: number;
  description?: string;
};

/**
 * Register operational consumption against an active stay and append to an
 * eligible Cotação/Proforma when one exists (or create+submit one when requested).
 *
 * - Prices verified server-side via catalog mapping / Aggregate.
 * - Browser totals are never authoritative.
 * - Published/locked central documents reject mutations.
 * - Local stay charges remain operational (not a fiscal ledger).
 */
export async function registerOperationalConsumption(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    stayId: string;
    lines: ConsumptionLineInput[];
    /** Create a Cotação and submit if none eligible exists */
    createDocumentIfMissing?: boolean;
    /** Client idempotency for Aggregate append */
    idempotencyKey?: string;
  },
) {
  if (!input.lines.length) throw new Error("At least one product line is required");

  const stay = await getStay(prisma, ctx, input.stayId);
  if (!["ACTIVE", "CHECKOUT_PENDING"].includes(stay.status)) {
    throw new Error("Consumption can only be registered on an active stay");
  }

  const charges = [];
  for (const line of input.lines) {
    const charge = await addStayCharge(prisma, ctx, stay.id, {
      kind: "PRODUCT",
      description: line.description?.trim() || `Consumo ${line.mappingLocalCode}`,
      quantity: line.quantity,
      mappingLocalCode: line.mappingLocalCode,
    });
    charges.push(charge);
  }

  let invoice = await findEligibleInvoiceForStay(prisma, ctx, stay.id);
  let createdDocument = false;

  if (!invoice?.saleKey && input.createDocumentIfMissing) {
    const draft = await createInvoiceDraft(prisma, ctx, {
      guestId: stay.guestId,
      reservationId: stay.reservationId,
      stayId: stay.id,
      hotelId: stay.hotelId,
      state: "Cotação",
      notes: `Consumo operacional — estadia ${stay.id}`,
      lines: input.lines.map((l) => ({
        mappingLocalCode: l.mappingLocalCode,
        quantity: l.quantity,
        discount: l.discount,
        description: l.description,
      })),
    });
    invoice = await submitInvoice(prisma, ctx, draft.id);

    if (invoice.status !== "CREATED") {
      await prisma.stayAccountCharge.updateMany({
        where: { id: { in: charges.map((c) => c.id) } },
        data: { invoiceIntegrationId: invoice.id },
      });

      await prisma.auditLog.create({
        data: {
          institutionId: ctx.institutionId,
          actorUserId: ctx.userId,
          action: "UPDATE",
          entityType: "OperationalConsumption",
          entityId: stay.id,
          metadata: {
            event: "consumption.document_unconfirmed",
            invoiceId: invoice.id,
            invoiceStatus: invoice.status,
            chargeIds: charges.map((c) => c.id),
          },
        },
      });

      return {
        stayId: stay.id,
        charges,
        invoice,
        createdDocument: false,
        appended: false,
        reconciliationRequired: invoice.status === "RECONCILIATION_REQUIRED",
        message:
          "Consumo registado na conta local, mas o envio ao SIGESC não foi confirmado (reconciliação necessária antes de considerar faturado).",
      };
    }

    createdDocument = true;

    await prisma.stayAccountCharge.updateMany({
      where: { id: { in: charges.map((c) => c.id) } },
      data: { invoiceIntegrationId: invoice.id, status: "HANDED_OFF" },
    });

    await prisma.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "OperationalConsumption",
        entityId: stay.id,
        metadata: {
          event: "consumption.document_created",
          invoiceId: invoice.id,
          chargeIds: charges.map((c) => c.id),
        },
      },
    });

    return {
      stayId: stay.id,
      charges,
      invoice,
      createdDocument,
      appended: false,
      reconciliationRequired: false,
      message: "Cotação criada e confirmada no SIGESC com os produtos do consumo.",
    };
  }

  if (!invoice || !invoice.saleKey) {
    return {
      stayId: stay.id,
      charges,
      invoice: invoice ?? null,
      createdDocument: false,
      appended: false,
      message:
        "Consumo registado na conta operacional. Sem Cotação/Proforma elegível — abra/crie um documento para anexar ao Aggregate.",
    };
  }

  if (!isEditableCentralState(invoice.centralState)) {
    return {
      stayId: stay.id,
      charges,
      invoice,
      createdDocument: false,
      appended: false,
      message: `Documento central em estado "${invoice.centralState ?? "desconhecido"}" — mutação financeira bloqueada. Consumo ficou só na conta operacional.`,
    };
  }

  const idempotencyKey =
    input.idempotencyKey?.trim() || `consume-${stay.id}-${randomUUID()}`;

  const updated = await addItemsToInvoice(
    prisma,
    ctx,
    invoice.id,
    input.lines.map((l) => ({
      mappingLocalCode: l.mappingLocalCode,
      quantity: l.quantity,
      discount: l.discount,
      description: l.description,
    })),
    { idempotencyKey },
  );

  await prisma.stayAccountCharge.updateMany({
    where: { id: { in: charges.map((c) => c.id) } },
    data: { invoiceIntegrationId: updated.id, status: "HANDED_OFF" },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "OperationalConsumption",
      entityId: stay.id,
      metadata: {
        event: "consumption.appended",
        invoiceId: updated.id,
        token: idempotencyKey,
        chargeIds: charges.map((c) => c.id),
        centralState: updated.centralState,
        centralTotal: updated.centralTotal != null ? Number(updated.centralTotal) : null,
      },
    },
  });

  return {
    stayId: stay.id,
    charges,
    invoice: updated,
    createdDocument,
    appended: true,
    message: "Consumo anexado ao documento central elegível.",
  };
}
