import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import {
  extractInvoiceLines,
  extractInvoicePayments,
  getInvoiceIntegration,
} from "@/modules/sigesc-integration/invoices/invoice-service";
import { listCatalogMappings } from "@/modules/sigesc-integration/products/products-service";
import { InvoiceDetailClient } from "./invoice-detail-client";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await getTranslations();
  const ctx = await requirePageTenant("integrations.invoices");

  let invoice;
  try {
    invoice = await getInvoiceIntegration(prisma, ctx, id);
  } catch {
    notFound();
  }

  const [mappings, guest, hotel] = await Promise.all([
    listCatalogMappings(prisma, ctx, { activeOnly: true, take: 50 }),
    invoice.guestId
      ? prisma.guest.findFirst({
          where: { id: invoice.guestId, institutionId: ctx.institutionId },
          select: { firstName: true, lastName: true },
        })
      : null,
    invoice.hotelId
      ? prisma.hotel.findFirst({
          where: { id: invoice.hotelId, institutionId: ctx.institutionId },
          select: { name: true },
        })
      : null,
  ]);

  const lines = extractInvoiceLines(invoice.linesJson);
  const payments = extractInvoicePayments(invoice.linesJson);
  const canSettle = ctx.permissions.includes("integrations.invoices.settle");

  const officialTitle =
    invoice.orderReference &&
    !invoice.orderReference.startsWith("HOT-INV-") &&
    !invoice.orderReference.startsWith("API-HOT-INV-")
      ? invoice.orderReference
      : "Rascunho local";

  return (
    <AppShell title={officialTitle}>
      <InvoiceDetailClient
        canSettle={canSettle}
        invoice={{
          id: invoice.id,
          externalId: invoice.externalId,
          requestedState: invoice.requestedState,
          status: invoice.status,
          saleKey: invoice.saleKey,
          orderReference: invoice.orderReference,
          centralState: invoice.centralState,
          centralTotal: invoice.centralTotal != null ? Number(invoice.centralTotal) : null,
          centralSubtotal: invoice.centralSubtotal != null ? Number(invoice.centralSubtotal) : null,
          centralTax: invoice.centralTax != null ? Number(invoice.centralTax) : null,
          centralRestPayable:
            invoice.centralRestPayable != null ? Number(invoice.centralRestPayable) : null,
          currency: invoice.currency,
          lastError: invoice.lastError,
          notes: invoice.notes,
          guestLabel: guest ? `${guest.firstName} ${guest.lastName}` : null,
          hotelLabel: hotel?.name ?? null,
          stayId: invoice.stayId,
          reservationId: invoice.reservationId,
          createdAt: invoice.createdAt.toISOString(),
          updatedAt: invoice.updatedAt.toISOString(),
          lines,
          payments,
          attempts: invoice.attempts.map((a) => ({
            id: a.id,
            attemptNo: a.attemptNo,
            outcome: a.outcome,
            createdAt: a.createdAt.toISOString(),
            errorMessage: a.errorMessage,
          })),
        }}
        mappings={mappings
          .filter((m) => m.active)
          .map((m) => ({
            value: m.localCode,
            label: m.localLabel || m.centralName || m.localCode,
            keywords: [m.localCode, m.centralProductId, m.centralName ?? ""],
            description:
              m.centralSalePrice != null ? `Ref. ${Number(m.centralSalePrice)} AOA` : undefined,
            unitPriceHint: m.centralSalePrice != null ? Number(m.centralSalePrice) : null,
          }))}
      />
    </AppShell>
  );
}
