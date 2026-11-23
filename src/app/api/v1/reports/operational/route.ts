import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  getOperationalReportsBundle,
  toCsv,
} from "@/modules/reporting/operational-reports";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

function parseFilters(url: URL) {
  const hotelId = url.searchParams.get("hotelId") ?? undefined;
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  return {
    hotelId,
    from: fromRaw ? toDateOnlyUtc(fromRaw) : undefined,
    to: toRaw ? toDateOnlyUtc(toRaw) : undefined,
  };
}

export async function GET(request: Request) {
  const authz = await requireTenant("reports.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const filters = parseFilters(url);

  try {
    const bundle = await getOperationalReportsBundle(prisma, authz.ctx, filters);

    if (format === "csv") {
      const section = url.searchParams.get("section") ?? "occupancy";
      const rows: Array<Array<unknown>> = [];
      let headers: string[] = [];

      if (section === "occupancy") {
        headers = ["date", "occupiedStays"];
        for (const d of bundle.occupancy.daily) {
          rows.push([d.date, d.occupiedStays]);
        }
        rows.unshift([
          "summary",
          `occupancyPercent=${bundle.occupancy.occupancyPercent};total=${bundle.occupancy.totalRooms};occupied=${bundle.occupancy.occupiedRooms};available=${bundle.occupancy.availableRooms};blocked=${bundle.occupancy.blockedMaintenance}`,
        ]);
      } else if (section === "reservations") {
        headers = ["metric", "value"];
        rows.push(
          ["confirmed", bundle.reservations.confirmed],
          ["pending", bundle.reservations.pending],
          ["cancelled", bundle.reservations.cancelled],
          ["noShow", bundle.reservations.noShow],
        );
      } else if (section === "stays") {
        headers = ["metric", "value"];
        rows.push(
          ["checkIns", bundle.stays.checkIns],
          ["checkOuts", bundle.stays.checkOuts],
          ["activeStays", bundle.stays.activeStays],
          ["extensions", bundle.stays.extensions],
          ["earlyDepartures", bundle.stays.earlyDepartures],
          ["averageStayNights", bundle.stays.averageStayNights],
        );
      } else if (section === "housekeeping") {
        headers = ["metric", "value"];
        rows.push(
          ["completed", bundle.housekeeping.completed],
          ["pending", bundle.housekeeping.pending],
          ["overdue", bundle.housekeeping.overdue],
          ["inspectionsApproved", bundle.housekeeping.inspectionsApproved],
          ["inspectionsRejected", bundle.housekeeping.inspectionsRejected],
          ["averageCleaningMinutes", bundle.housekeeping.averageCleaningMinutes],
        );
      } else if (section === "maintenance") {
        headers = ["metric", "value"];
        rows.push(
          ["open", bundle.maintenance.open],
          ["inProgress", bundle.maintenance.inProgress],
          ["resolved", bundle.maintenance.resolved],
          ["blockingOpen", bundle.maintenance.blockingOpen],
          ["averageResolutionHours", bundle.maintenance.averageResolutionHours],
        );
      } else if (section === "commerce") {
        headers = ["metric", "value"];
        rows.push(
          ["consumptionLines", bundle.commerce.consumptionLines],
          ["operationalTotal", bundle.commerce.operationalTotal],
          ["handedOffLines", bundle.commerce.handedOffLines],
          ["documentsCreated", bundle.commerce.documentsCreated],
          ["cotacaoOrQuote", bundle.commerce.cotacaoOrQuote],
          ["proforma", bundle.commerce.proforma],
          ["reconciliationRequired", bundle.commerce.reconciliationRequired],
          ["centralTotalsSum", bundle.commerce.centralTotalsSum],
          ["disclaimer", bundle.commerce.disclaimer],
        );
      } else {
        return NextResponse.json({ error: "Unknown CSV section" }, { status: 400 });
      }

      const csv = toCsv(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hotelaria-${section}-report.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ reports: bundle });
  } catch (err) {
    return jsonError(err);
  }
}
