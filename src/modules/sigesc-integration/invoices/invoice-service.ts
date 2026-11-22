import { randomUUID } from "crypto";
import type { InvoiceIntegration, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getAggregateClient } from "../client";
import {
  assertAggregateScope,
  assertCompanyMatchesConnection,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import type { AggregateSaleCreateInput, AggregateSaleItemInput } from "../types";
import { AggregateApiError } from "../types";

export const HOTELARIA_PARTNER = "sigesc_hotelaria";

const SUBMITTABLE: Array<InvoiceIntegration["status"]> = [
  "DRAFT",
  "PENDING_SUBMISSION",
  "FAILED_VALIDATION",
  "RECONCILIATION_REQUIRED",
];

export type InvoiceLineDraft = {
  /** Local catalog mapping code OR direct central product id */
  mappingLocalCode?: string;
  centralProductId?: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  description?: string;
};

function normalizeRequestedState(state: string): "Cotação" | "Proforma" {
  const s = state.trim().toLowerCase();
  if (s === "cotação" || s === "cotacao" || s === "quote" || s === "draft") return "Cotação";
  if (s === "proforma") return "Proforma";
  throw new Error("Only Cotação or Proforma may be created via Aggregate");
}

async function resolveLineItems(
  prisma: PrismaClient,
  ctx: TenantContext,
  companyId: string,
  lines: InvoiceLineDraft[],
): Promise<
  Array<{
    product_id: number;
    quantity: number;
    unit_price?: number;
    discount?: number;
    description?: string;
    centralName?: string | null;
    localCode?: string | null;
  }>
> {
  if (!lines.length) throw new Error("At least one invoice line is required");

  const resolved: Array<{
    product_id: number;
    quantity: number;
    unit_price?: number;
    discount?: number;
    description?: string;
    centralName?: string | null;
    localCode?: string | null;
  }> = [];

  for (const line of lines) {
    if (line.quantity <= 0) throw new Error("Line quantity must be positive");

    let productId = line.centralProductId;
    let centralName: string | null = null;
    let localCode: string | null = line.mappingLocalCode ?? null;

    if (line.mappingLocalCode) {
      const mapping = await prisma.productCatalogMapping.findUnique({
        where: {
          institutionId_localCode: {
            institutionId: ctx.institutionId,
            localCode: line.mappingLocalCode,
          },
        },
      });
      if (!mapping || !mapping.active) {
        throw new Error(
          `Local service "${line.mappingLocalCode}" has no active central product mapping`,
        );
      }
      if (mapping.centralCompanyId !== companyId) {
        throw new Error("Catalog mapping belongs to a different central company");
      }
      productId = mapping.centralProductId;
      centralName = mapping.centralName;
      localCode = mapping.localCode;
    }

    if (!productId) {
      throw new Error("Each line requires a central product mapping or product id");
    }

    resolved.push({
      product_id: Number(productId),
      quantity: line.quantity,
      unit_price: line.unitPrice,
      discount: line.discount,
      description: line.description,
      centralName,
      localCode,
    });
  }

  return resolved;
}

export async function listInvoiceIntegrations(prisma: PrismaClient, ctx: TenantContext) {
  return prisma.invoiceIntegration.findMany({
    where: { institutionId: ctx.institutionId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getInvoiceIntegration(
  prisma: PrismaClient,
  ctx: TenantContext,
  invoiceId: string,
) {
  const invoice = await prisma.invoiceIntegration.findUnique({
    where: { id: invoiceId },
    include: { attempts: { orderBy: { attemptNo: "asc" } } },
  });
  if (!invoice || invoice.institutionId !== ctx.institutionId) {
    throw new Error("Invoice integration not found");
  }
  return invoice;
}

export async function createInvoiceDraft(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    reservationId?: string;
    guestId?: string;
    state: string;
    notes?: string;
    lines: InvoiceLineDraft[];
    /** Explicit authorization to send nested customer fields when no mapping */
    useCustomerFallback?: boolean;
    customerFallback?: {
      name?: string;
      email?: string;
      phone?: string;
      nif?: string;
    };
  },
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "sales");
  assertAggregateScope(resolved, "products");

  const requestedState = normalizeRequestedState(input.state);
  const lineItems = await resolveLineItems(
    prisma,
    ctx,
    resolved.companyId,
    input.lines,
  );

  // Validate products exist centrally for this company
  const client = getAggregateClient();
  for (const line of lineItems) {
    const product = await client.getProduct(resolved.apiKey, line.product_id, {
      company_id: resolved.companyNumericId,
    });
    assertCompanyMatchesConnection(resolved, product.company_id);
  }

  let centralCustomerId: string | null = null;
  if (input.guestId) {
    const guest = await prisma.guest.findFirst({
      where: { id: input.guestId, institutionId: ctx.institutionId },
      include: { customerMapping: true },
    });
    if (!guest) throw new Error("Guest not found");
    if (guest.customerMapping?.syncStatus === "LINKED" && guest.customerMapping.externalCustomerId) {
      if (guest.customerMapping.companyId && guest.customerMapping.companyId !== resolved.companyId) {
        throw new Error("Guest mapping belongs to a different central company");
      }
      centralCustomerId = guest.customerMapping.externalCustomerId;
      // Verify customer still exists for company
      await client.getCustomer(resolved.apiKey, centralCustomerId, {
        company_id: resolved.companyNumericId,
      });
    } else if (!input.useCustomerFallback) {
      throw new Error(
        "Guest is not linked to a central customer. Link or authorize customer fallback first.",
      );
    }
  }

  if (input.reservationId) {
    const reservation = await prisma.reservation.findFirst({
      where: { id: input.reservationId, institutionId: ctx.institutionId },
    });
    if (!reservation) throw new Error("Reservation not found");
  }

  const externalId = `HOT-INV-${randomUUID()}`;

  const invoice = await prisma.invoiceIntegration.create({
    data: {
      institutionId: ctx.institutionId,
      connectionId: resolved.connection.id,
      reservationId: input.reservationId ?? null,
      guestId: input.guestId ?? null,
      externalId,
      partner: HOTELARIA_PARTNER,
      requestedState,
      status: "DRAFT",
      centralCompanyId: resolved.companyId,
      centralCustomerId,
      notes: input.notes ?? null,
      linesJson: {
        lines: lineItems,
        useCustomerFallback: Boolean(input.useCustomerFallback),
        customerFallback: input.useCustomerFallback ? input.customerFallback ?? null : null,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "InvoiceIntegration",
      entityId: invoice.id,
      metadata: { externalId, requestedState },
    },
  });

  return invoice;
}

function buildSalePayload(invoice: InvoiceIntegration): AggregateSaleCreateInput {
  const linesJson = invoice.linesJson as {
    lines: Array<{
      product_id: number;
      quantity: number;
      unit_price?: number;
      discount?: number;
      description?: string;
    }>;
    useCustomerFallback?: boolean;
    customerFallback?: {
      name?: string;
      email?: string;
      phone?: string;
      nif?: string;
    } | null;
  };

  const items: AggregateSaleItemInput[] = linesJson.lines.map((l) => ({
    product_id: l.product_id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount,
    description: l.description,
  }));

  const payload: AggregateSaleCreateInput = {
    company_id: Number(invoice.centralCompanyId),
    external_id: invoice.externalId,
    partner: invoice.partner,
    state: invoice.requestedState,
    notes: invoice.notes ?? undefined,
    items,
  };

  if (invoice.centralCustomerId) {
    payload.customer_id = Number(invoice.centralCustomerId);
  } else if (linesJson.useCustomerFallback && linesJson.customerFallback) {
    payload.customer_name = linesJson.customerFallback.name;
    payload.customer_email = linesJson.customerFallback.email;
    payload.customer_phone = linesJson.customerFallback.phone;
    payload.customer_nif = linesJson.customerFallback.nif;
  }

  return payload;
}

async function recordAttempt(
  prisma: PrismaClient,
  invoiceId: string,
  data: {
    outcome: string;
    httpStatus?: number;
    remoteSaleKey?: string;
    responseSummary?: unknown;
    errorMessage?: string;
  },
) {
  const count = await prisma.invoiceSubmissionAttempt.count({ where: { invoiceId } });
  return prisma.invoiceSubmissionAttempt.create({
    data: {
      invoiceId,
      attemptNo: count + 1,
      outcome: data.outcome,
      httpStatus: data.httpStatus ?? null,
      remoteSaleKey: data.remoteSaleKey ?? null,
      responseSummary: data.responseSummary ?? undefined,
      errorMessage: data.errorMessage ?? null,
    },
  });
}

function persistSaleFields(sale: {
  id: number;
  sale_key: string;
  order_reference?: string | null;
  state: string;
  total?: number;
  subtotal?: number;
  tax?: number;
  rest_payable?: number;
  customer?: { id?: number } | null;
}) {
  return {
    status: "CREATED" as const,
    centralSaleId: String(sale.id),
    saleKey: sale.sale_key,
    orderReference: sale.order_reference ?? null,
    centralState: sale.state,
    centralTotal: sale.total ?? null,
    centralSubtotal: sale.subtotal ?? null,
    centralTax: sale.tax ?? null,
    centralRestPayable: sale.rest_payable ?? null,
    centralCustomerId: sale.customer?.id ? String(sale.customer.id) : undefined,
    submittedAt: new Date(),
    lastError: null,
  };
}

/**
 * Submit a draft invoice. Uses optimistic claim to prevent concurrent submission.
 * Never regenerates external_id. On ambiguous timeout → RECONCILIATION_REQUIRED.
 */
export async function submitInvoice(
  prisma: PrismaClient,
  ctx: TenantContext,
  invoiceId: string,
) {
  const existing = await getInvoiceIntegration(prisma, ctx, invoiceId);
  if (existing.status === "CREATED") {
    return existing;
  }
  if (existing.status === "SUBMITTING") {
    throw new Error("Invoice submission already in progress");
  }
  if (!SUBMITTABLE.includes(existing.status)) {
    throw new Error(`Cannot submit invoice in status ${existing.status}`);
  }

  const claimed = await prisma.invoiceIntegration.updateMany({
    where: {
      id: invoiceId,
      institutionId: ctx.institutionId,
      status: { in: SUBMITTABLE },
    },
    data: { status: "SUBMITTING" },
  });
  if (claimed.count !== 1) {
    throw new Error("Could not claim invoice for submission (concurrent or invalid state)");
  }

  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "sales");
  if (resolved.connection.id !== existing.connectionId) {
    await prisma.invoiceIntegration.update({
      where: { id: invoiceId },
      data: {
        status: "FAILED_FINAL",
        lastError: "Aggregate connection changed since draft was created",
      },
    });
    throw new Error("Aggregate connection changed since draft was created");
  }

  const invoice = await prisma.invoiceIntegration.findUniqueOrThrow({ where: { id: invoiceId } });
  const payload = buildSalePayload(invoice);
  const client = getAggregateClient();

  try {
    const { httpStatus, result } = await client.createSale(resolved.apiKey, payload);
    const fields = persistSaleFields(result.sale);
    const updated = await prisma.invoiceIntegration.update({
      where: { id: invoiceId },
      data: {
        ...fields,
        idempotentHit: Boolean(result.idempotent) || httpStatus === 200,
      },
    });
    await recordAttempt(prisma, invoiceId, {
      outcome: result.idempotent || httpStatus === 200 ? "IDEMPOTENT_HIT" : "CREATED",
      httpStatus,
      remoteSaleKey: result.sale.sale_key,
      responseSummary: {
        created: result.created,
        idempotent: result.idempotent,
        sale_id: result.sale.id,
        state: result.sale.state,
        total: result.sale.total,
      },
    });
    await prisma.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "InvoiceIntegration",
        entityId: invoiceId,
        metadata: {
          outcome: result.idempotent ? "idempotent" : "created",
          saleKey: result.sale.sale_key,
        },
      },
    });
    return updated;
  } catch (err) {
    if (err instanceof AggregateApiError && (err.status === 504 || err.status === 503)) {
      const updated = await prisma.invoiceIntegration.update({
        where: { id: invoiceId },
        data: {
          status: "RECONCILIATION_REQUIRED",
          lastError: err.message,
        },
      });
      await recordAttempt(prisma, invoiceId, {
        outcome: "AMBIGUOUS_TIMEOUT",
        httpStatus: err.status,
        errorMessage: err.message,
      });
      return updated;
    }

    if (err instanceof AggregateApiError && (err.status === 422 || err.status === 400)) {
      await prisma.invoiceIntegration.update({
        where: { id: invoiceId },
        data: {
          status: "FAILED_VALIDATION",
          lastError: err.message,
        },
      });
      await recordAttempt(prisma, invoiceId, {
        outcome: "VALIDATION_FAILED",
        httpStatus: err.status,
        errorMessage: err.message,
      });
      throw err;
    }

    const message = err instanceof Error ? err.message : "Submission failed";
    await prisma.invoiceIntegration.update({
      where: { id: invoiceId },
      data: {
        status: "FAILED_FINAL",
        lastError: message,
      },
    });
    await recordAttempt(prisma, invoiceId, {
      outcome: "FAILED",
      httpStatus: err instanceof AggregateApiError ? err.status : undefined,
      errorMessage: message,
    });
    throw err;
  }
}

/**
 * Controlled recovery: re-POST the same external_id (never a new one).
 * Documented idempotency returns the existing sale if it was created.
 */
export async function reconcileInvoice(
  prisma: PrismaClient,
  ctx: TenantContext,
  invoiceId: string,
) {
  const invoice = await getInvoiceIntegration(prisma, ctx, invoiceId);
  if (invoice.status === "CREATED" && invoice.saleKey) {
    return refreshInvoiceFromCentral(prisma, ctx, invoiceId);
  }
  if (
    invoice.status !== "RECONCILIATION_REQUIRED" &&
    invoice.status !== "SUBMITTING" &&
    invoice.status !== "FAILED_VALIDATION"
  ) {
    throw new Error(`Nothing to reconcile for status ${invoice.status}`);
  }

  // Prefer GET by sale_key when known; otherwise safe re-POST with same external_id
  if (invoice.saleKey) {
    return refreshInvoiceFromCentral(prisma, ctx, invoiceId);
  }

  return submitInvoice(prisma, ctx, invoiceId);
}

export async function refreshInvoiceFromCentral(
  prisma: PrismaClient,
  ctx: TenantContext,
  invoiceId: string,
) {
  const invoice = await getInvoiceIntegration(prisma, ctx, invoiceId);
  if (!invoice.saleKey) {
    throw new Error("Invoice has no sale_key to refresh");
  }
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "sales");
  const client = getAggregateClient();
  const sale = await client.getSale(resolved.apiKey, invoice.saleKey);
  assertCompanyMatchesConnection(resolved, sale.company_id);

  const updated = await prisma.invoiceIntegration.update({
    where: { id: invoiceId },
    data: {
      ...persistSaleFields(sale),
      status: "CREATED",
    },
  });

  await recordAttempt(prisma, invoiceId, {
    outcome: "REFRESHED",
    remoteSaleKey: sale.sale_key,
    responseSummary: {
      sale_id: sale.id,
      state: sale.state,
      total: sale.total,
    },
  });

  return updated;
}

export async function addItemsToInvoice(
  prisma: PrismaClient,
  ctx: TenantContext,
  invoiceId: string,
  lines: InvoiceLineDraft[],
) {
  const invoice = await getInvoiceIntegration(prisma, ctx, invoiceId);
  if (invoice.status !== "CREATED" || !invoice.saleKey) {
    throw new Error("Items can only be added to a created Cotação/Proforma");
  }
  if (invoice.centralState !== "Cotação" && invoice.centralState !== "Proforma") {
    throw new Error("Central invoice is not in an editable state");
  }

  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "sales");
  const lineItems = await resolveLineItems(prisma, ctx, resolved.companyId, lines);
  const client = getAggregateClient();

  // Claim a local "adding items" attempt id to avoid duplicate append after ambiguity
  const attemptToken = `add-items-${randomUUID()}`;
  await recordAttempt(prisma, invoiceId, {
    outcome: "ADD_ITEMS_PENDING",
    responseSummary: { token: attemptToken, lines: lineItems },
  });

  try {
    const sale = await client.addSaleItems(
      resolved.apiKey,
      invoice.saleKey,
      lineItems.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        description: l.description,
      })),
    );
    const updated = await prisma.invoiceIntegration.update({
      where: { id: invoiceId },
      data: persistSaleFields(sale),
    });
    await recordAttempt(prisma, invoiceId, {
      outcome: "ADD_ITEMS_OK",
      remoteSaleKey: sale.sale_key,
      responseSummary: { token: attemptToken, total: sale.total },
    });
    return updated;
  } catch (err) {
    await recordAttempt(prisma, invoiceId, {
      outcome: "ADD_ITEMS_FAILED",
      errorMessage: err instanceof Error ? err.message : "add items failed",
      responseSummary: { token: attemptToken },
    });
    throw err;
  }
}
