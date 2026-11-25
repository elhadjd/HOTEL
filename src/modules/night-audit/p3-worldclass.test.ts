import { afterEach, describe, expect, it, vi } from "vitest";
import { computeHotelKpis } from "./night-audit-service";
import { computeFolioBalance } from "@/modules/stays/folio-service";
import { getRequestId, withRequestId } from "@/server/logger";
import { HttpAggregateAdapter } from "@/modules/sigesc-integration/http-adapter";

describe("P3 Night Audit hospitality KPIs (Occupancy, ADR, RevPAR)", () => {
  it("computes accurate Occupancy %, ADR, RevPAR, and total operational revenue", () => {
    const kpis = computeHotelKpis({
      sellableRooms: 20,
      occupiedRooms: 15,
      accommodationRevenue: 450_000,
      extrasRevenue: 75_000,
    });
    expect(kpis.occupancyPercent).toBe(75);
    expect(kpis.adr).toBe(30_000);
    expect(kpis.revpar).toBe(22_500);
    expect(kpis.totalRevenue).toBe(525_000);
  });

  it("handles zero sellable or occupied rooms safely without NaN/Infinity", () => {
    expect(
      computeHotelKpis({
        sellableRooms: 0,
        occupiedRooms: 0,
        accommodationRevenue: 0,
        extrasRevenue: 0,
      }),
    ).toEqual({
      occupancyPercent: 0,
      adr: 0,
      revpar: 0,
      totalRevenue: 0,
    });
  });
});

describe("P3 Split Billing folio balance calculation", () => {
  it("subtracts operational deposit from folio charges cleanly", () => {
    const summary = computeFolioBalance({
      lines: [
        { unitPrice: 25000, quantity: 3 },
        { unitPrice: 4500, quantity: 2 },
      ],
      depositAmount: 30000,
    });
    expect(summary).toEqual({
      chargesTotal: 84000,
      depositAmount: 30000,
      balanceDue: 54000,
    });
  });
});

describe("P3 requestId correlation in logger & SIGESC HTTP adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates AsyncLocalStorage requestId into outgoing SIGESC X-Request-Id header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 7, name: "Cliente Teste" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const adapter = new HttpAggregateAdapter("https://app.sisgesc.net");
    await withRequestId("req_trace_p3_1234", async () => {
      expect(getRequestId()).toBe("req_trace_p3_1234");
      await adapter.getCustomer("mca_test", 7);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBe("req_trace_p3_1234");
  });
});
