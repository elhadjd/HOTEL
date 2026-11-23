import { randomUUID } from "crypto";
import type { InvoiceIntegration, Prisma, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getAggregateClient } from "../client";
import {
  assertAggregateScope,
  assertCompanyMatchesConnection,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import type { AggregateSaleCreateInput, AggregateSaleItemInput } from "../types";
import { AggregateApiError } from "../types";
import { verifyCentralProductPrice } from "../products/products-service";
import { isGuestCustomerLinked } from "@/modules/guests/guest-service";

export const HOTELARIA_PARTNER = "sigesc_hotelaria";

const SUBMITTABLE: Array<InvoiceIntegration["status"]> = [
  "DRAFT",
  "PENDING_SUBMISSION",
  "FAILED_VALIDATION",
  "RECONCILIATION_REQUIRED",
];

/** Aggregate states that still allow POST /sales/{sale_key}/items */
export const EDITABLE_CENTRAL_STATES = new Set(["Cotação", "Proforma"]);

/** Central states that must never accept financial mutations */
export const READONLY_CENTRAL_STATES = new Set([
  "Publicado",
  "Pago",
  "Cancelado",
  "Recusado",
  "Anulado",
]);

export type InvoiceLineDraft = {
  /** Local catalog mapping code OR direct central product id */
  mappingLocalCode?: string;
  centralProductId?: string;
  quantity: number;
  /**
   * Browser-supplied unit price is never trusted.
   * Official price always comes from verifyCentralProductPrice().
   */
  unitPrice?: number;
  /** Line discount in currency units — Aggregate contract supports it */
  discount?: number;
  description?: string;
};

export type InvoiceListFilters = {
  q?: string;
  state?: string;
  status?: InvoiceIntegration["status"];
  guestId?: string;
  stayId?: string;
  reservationId?: string;
  hotelId?: string;
  from?: Date;
  to?: Date;
  take?: number;
  skip?: number;
};

function normalizeRequestedState(state: string): "Cotação" | "Proforma" {
  const s = state.trim().toLowerCase();
  if (s === "cotação" || s === "cotacao" || s === "quote" || s === "draft") return "Cotação";
  if (s === "proforma") return "Proforma";
  throw new Error("Only Cotação or Proforma may be created via Aggregate");
}

export function isEditableCentralState(state: string | null | undefined): boolean {
  if (!state) return false;
  return EDITABLE_CENTRAL_STATES.has(state);
}

export function assertEditableCentralState(state: string | null | undefined): void {
  if (!state || !state.trim()) {
    throw new Error("Unknown / unavailable central document status — financial mutation blocked");
  }
  if (READONLY_CENTRAL_STATES.has(state) || !EDITABLE_CENTRAL_STATES.has(state)) {
    throw new Error(
      `Central document status "${state}" is read-only. Adding items or editing is not allowed.`,
    );
  }
}

function normalizeDiscount(discount: number | undefined, unitPrice: number, quantity: number): number {
  if (discount == null || Number.isNaN(discount)) return 0;
  if (discount < 0) throw new Error("Line discount cannot be negative");
  const max = Number((unitPrice * quantity).toFixed(2));
  const value = Number(discount.toFixed(2));
  if (value > max) {
    throw new Error(`Line discount ${value} exceeds line net ${max}`);
  }
  return value;
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
    unit_price: number;
    discount?: number;
    description?: string;
    centralName?: string | null;
    localCode?: string | null;
    tax_percent?: number | null;
    priceVerifiedAt: string;
  }>
> {
  if (!lines.length) throw new Error("At least one invoice line is required");

  const resolved: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    discount?: number;
    description?: string;
    centralName?: string | null;
    localCode?: string | null;
    tax_percent?: number | null;
    priceVerifiedAt: string;
  }> = [];

  for (const line of lines) {
    if (line.quantity <= 0) throw new Error("Line quantity must be positive");

    let productId = line.centralProductId;
    let localCode: string | null = line.mappingLocalCode ?? null;
    let mappingId: string | null = null;

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
      localCode = mapping.localCode;
      mappingId = mapping.id;
    }

    if (!productId) {
      throw new Error("Each line requires a central product mapping or product id");
    }

    // Official price: live Aggregate verification only — never legacyHistoricalPrice / browser unitPrice
    let verified;
    try {
      verified = await verifyCentralProductPrice(prisma, ctx, productId);
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? `Cannot verify central price for product #${productId}: ${err.message}`
          : `Cannot verify central price for product #${productId}`,
      );
    }

    if (mappingId) {
      await prisma.productCatalogMapping.update({
        where: { id: mappingId },
        data: {
          centralName: verified.name,
          centralSalePrice: verified.salePrice,
          centralTaxPercent: verified.taxPercent,
          centralPriceVerifiedAt: verified.verifiedAt,
          lastSyncedAt: verified.verifiedAt,
          lastError: null,
        },
      });
    }

    const discount = normalizeDiscount(line.discount, verified.salePrice, line.quantity);

    resolved.push({
      product_id: verified.productId,
      quantity: line.quantity,
      // Always central verified price — never browser unitPrice
      unit_price: verified.salePrice,
      discount: discount > 0 ? discount : undefined,
      description: line.description,
      centralName: verified.name,
      localCode,
      tax_percent: verified.taxPercent,
      priceVerifiedAt: verified.verifiedAt.toISOString(),
    });
  }

  return resolved;
}

export async function listInvoiceIntegrations(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: InvoiceListFilters = {},
) {
  const take = Math.min(Math.max(filters.take ?? 50, 1), 200);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = filters.q?.trim();

  const where = {
    institutionId: ctx.institutionId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.state ? { requestedState: filters.state } : {}),
    ...(filters.guestId ? { guestId: filters.guestId } : {}),
    ...(filters.stayId ? { stayId: filters.stayId } : {}),
    ...(filters.reservationId ? { reservationId: filters.reservationId } : {}),
    ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { externalId: { contains: q } },
            { saleKey: { contains: q } },
            { orderReference: { contains: q } },
            { centralCustomerId: { contains: q } },
            { notes: { contains: q } },
            { centralState: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoiceIntegration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.invoiceIntegration.count({ where }),
  ]);

  return { rows, total, take, skip };
}

/** Eligible Cotação/Proforma already linked to a stay (avoid accidental duplicates). */
export async function findEligibleInvoiceForStay(
  prisma: PrismaClient,
  ctx: TenantContext,
  stayId: string,
) {
  const stay = await prisma.stay.findFirst({
    where: { id: stayId, institutionId: ctx.institutionId },
  });
  if (!stay) throw new Error("Stay not found");

  const candidates = await prisma.invoiceIntegration.findMany({
    where: {
      institutionId: ctx.institutionId,
      OR: [{ stayId }, { reservationId: stay.reservationId, guestId: stay.guestId }],
      status: { in: ["CREATED", "DRAFT", "PENDING_SUBMISSION", "RECONCILIATION_REQUIRED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return candidates.find((inv) => {
    if (inv.status === "DRAFT" || inv.status === "PENDING_SUBMISSION") return true;
    if (inv.status === "CREATED") return isEditableCentralState(inv.centralState);
    return inv.status === "RECONCILIATION_REQUIRED";
  }) ?? null;
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
    stayId?: string;
    hotelId?: string;
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

  const client = getAggregateClient();

  let reservationId = input.reservationId ?? null;
  let stayId = input.stayId ?? null;
  let hotelId = input.hotelId ?? null;
  let guestId = input.guestId ?? null;

  if (stayId) {
    const stay = await prisma.stay.findFirst({
      where: { id: stayId, institutionId: ctx.institutionId },
    });
    if (!stay) throw new Error("Stay not found");
    stayId = stay.id;
    reservationId = stay.reservationId;
    hotelId = stay.hotelId;
    guestId = guestId ?? stay.guestId;

    const existing = await findEligibleInvoiceForStay(prisma, ctx, stay.id);
    if (existing && existing.status === "CREATED") {
      throw new Error(
        `Stay already has editable document ${existing.externalId}. Open it to add products instead of creating a duplicate.`,
      );
    }
  }

  if (hotelId) {
    const hotel = await prisma.hotel.findFirst({
      where: { id: hotelId, institutionId: ctx.institutionId },
    });
    if (!hotel) throw new Error("Hotel not found");
  }

  let centralCustomerId: string | null = null;
  if (guestId) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, institutionId: ctx.institutionId },
      include: { customerMapping: true },
    });
    if (!guest) throw new Error("Guest not found");
    if (isGuestCustomerLinked(guest.customerMapping)) {
      if (guest.customerMapping!.companyId && guest.customerMapping!.companyId !== resolved.companyId) {
        throw new Error("Guest mapping belongs to a different central company");
      }
      centralCustomerId = guest.customerMapping!.externalCustomerId;
      await client.getCustomer(resolved.apiKey, centralCustomerId!, {
        company_id: resolved.companyNumericId,
      });
    } else {
      throw new Error(
        "Guest has no valid SIGESC Central customer association. Resolve the mapping before invoicing.",
      );
    }
  }

  if (reservationId) {
    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, institutionId: ctx.institutionId },
    });
    if (!reservation) throw new Error("Reservation not found");
    hotelId = hotelId ?? reservation.hotelId;
  }

  const externalId = `HOT-INV-${randomUUID()}`;

  const invoice = await prisma.invoiceIntegration.create({
    data: {
      institutionId: ctx.institutionId,
      connectionId: resolved.connection.id,
      reservationId,
      stayId,
      hotelId,
      guestId,
      createdByUserId: ctx.userId,
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
      metadata: { externalId, requestedState, stayId, hotelId },
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

/**
 * Append lines to an existing central Cotação/Proforma.
 * Always re-fetches central status first — never trusts a stale local cache alone.
 */
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

  // Verify live central status before mutation (stale local status cannot bypass)
  const fresh = await refreshInvoiceFromCentral(prisma, ctx, invoiceId);
  assertEditableCentralState(fresh.centralState);

  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "sales");
  assertAggregateScope(resolved, "products");
  const lineItems = await resolveLineItems(prisma, ctx, resolved.companyId, lines);
  const client = getAggregateClient();

  // Claim a local "adding items" attempt id to avoid duplicate append after ambiguity
  const attemptToken = `add-items-${randomUUID()}`;
  await recordAttempt(prisma, invoiceId, {
    outcome: "ADD_ITEMS_PENDING",
    responseSummary: { token: attemptToken, lines: lineItems, centralState: fresh.centralState },
  });

  try {
    const sale = await client.addSaleItems(
      resolved.apiKey,
      fresh.saleKey!,
      lineItems.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        description: l.description,
      })),
    );
    assertEditableCentralState(sale.state);
    const prior =
      invoice.linesJson && typeof invoice.linesJson === "object"
        ? (invoice.linesJson as Record<string, unknown>)
        : {};
    const priorAppended = Array.isArray(prior.appended) ? prior.appended : [];
    const nextLinesJson = {
      ...prior,
      appended: [
        ...priorAppended,
        { at: new Date().toISOString(), token: attemptToken, lines: lineItems },
      ],
    } as Prisma.InputJsonValue;
    const updated = await prisma.invoiceIntegration.update({
      where: { id: invoiceId },
      data: {
        ...persistSaleFields(sale),
        linesJson: nextLinesJson,
      },
    });
    await recordAttempt(prisma, invoiceId, {
      outcome: "ADD_ITEMS_OK",
      remoteSaleKey: sale.sale_key,
      responseSummary: { token: attemptToken, total: sale.total, state: sale.state },
    });
    await prisma.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "InvoiceIntegration",
        entityId: invoiceId,
        metadata: {
          event: "invoice.items_appended",
          token: attemptToken,
          lineCount: lineItems.length,
          centralState: sale.state,
        },
      },
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

export function summarizeInvoiceLines(linesJson: unknown): {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  discount: number;
  currencyHint: string;
} {
  const lines =
    (linesJson as { lines?: Array<{ quantity?: number; unit_price?: number; discount?: number }> })
      ?.lines ?? [];
  let totalQuantity = 0;
  let subtotal = 0;
  let discount = 0;
  for (const line of lines) {
    const qty = Number(line.quantity ?? 0);
    const price = Number(line.unit_price ?? 0);
    const disc = Number(line.discount ?? 0);
    totalQuantity += qty;
    subtotal += price * qty;
    discount += disc;
  }
  return {
    itemCount: lines.length,
    totalQuantity,
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    currencyHint: "AOA",
  };
}
