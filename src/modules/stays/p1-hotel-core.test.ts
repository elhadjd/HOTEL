import { describe, expect, it } from "vitest";
import { deriveOccupancyStatus, toDateOnlyUtc } from "@/modules/reservations/availability";
import { assertReservationHotelPolicies } from "@/modules/reservations/reservation-service";
import { computeAccommodationQuote, type QuoteRatePlanInput } from "@/modules/rates/rates-service";
import { computeAccommodationSyncPlan } from "./accommodation-billing";

describe("P1 occupancy separation from future bookings", () => {
  it("prioritizes active stay over reservations and keeps future bookings AVAILABLE", () => {
    expect(
      deriveOccupancyStatus({
        hasActiveStay: true,
        hasReservationCoveringToday: true,
      }),
    ).toBe("OCCUPIED");

    expect(
      deriveOccupancyStatus({
        hasActiveStay: true,
        hasReservationCoveringToday: false,
      }),
    ).toBe("OCCUPIED");

    expect(
      deriveOccupancyStatus({
        hasActiveStay: false,
        hasReservationCoveringToday: true,
      }),
    ).toBe("RESERVED");

    expect(
      deriveOccupancyStatus({
        hasActiveStay: false,
        hasReservationCoveringToday: false,
      }),
    ).toBe("AVAILABLE");
  });
});

describe("P1 HotelSettings and capacity enforcement", () => {
  it("blocks children when hotel settings disallow children", () => {
    expect(() =>
      assertReservationHotelPolicies({
        nights: 2,
        adults: 2,
        children: 1,
        settings: { allowChildren: false, maxStayNights: 30 },
        rooms: [{ capacity: 4 }],
      }),
    ).toThrow(/does not allow children/i);
  });

  it("blocks stays exceeding HotelSettings.maxStayNights", () => {
    expect(() =>
      assertReservationHotelPolicies({
        nights: 15,
        adults: 2,
        children: 0,
        settings: { allowChildren: true, maxStayNights: 14 },
        rooms: [{ capacity: 2 }],
      }),
    ).toThrow(/maximum of 14 night/i);
  });

  it("enforces adults + children against total assigned room capacity (single and multi-room)", () => {
    expect(() =>
      assertReservationHotelPolicies({
        nights: 3,
        adults: 2,
        children: 2,
        settings: { allowChildren: true, maxStayNights: 30 },
        rooms: [{ capacity: 3 }],
      }),
    ).toThrow(/capacity \(3\) is insufficient for 4 guest/i);

    // Multi-room combined capacity passes cleanly
    expect(() =>
      assertReservationHotelPolicies({
        nights: 3,
        adults: 2,
        children: 2,
        settings: { allowChildren: true, maxStayNights: 30 },
        rooms: [{ capacity: 2 }, { capacity: 2 }],
      }),
    ).not.toThrow();
  });
});

describe("P1 RatePlan & SeasonalRate.minOccupancy engine", () => {
  const basePlan: QuoteRatePlanInput = {
    id: "plan-1",
    code: "STD",
    name: "Standard",
    baseAmount: 20000,
    currency: "AOA",
    weekdayOnly: false,
    weekendOnly: false,
    validFrom: null,
    validTo: null,
    minStayNights: 1,
    maxStayNights: null,
    includedOccupancy: 2,
    extraGuestAmount: 5000,
    priority: 10,
    seasonals: [
      {
        name: "Grupo Verão",
        startDate: toDateOnlyUtc("2026-12-20"),
        endDate: toDateOnlyUtc("2026-12-30"),
        amount: 32000,
        minOccupancy: 3,
        weekendOnly: false,
        weekdayOnly: false,
      },
    ],
  };

  it("applies SeasonalRate only when occupants satisfy minOccupancy", () => {
    const coupleQuote = computeAccommodationQuote([basePlan], {
      arrival: toDateOnlyUtc("2026-12-22"),
      departure: toDateOnlyUtc("2026-12-24"),
      occupants: 2,
    });
    expect(coupleQuote.nights[0]?.source).toBe("base");
    expect(coupleQuote.subtotal).toBe(40000);

    const groupQuote = computeAccommodationQuote([basePlan], {
      arrival: toDateOnlyUtc("2026-12-22"),
      departure: toDateOnlyUtc("2026-12-24"),
      occupants: 3,
    });
    expect(groupQuote.nights[0]?.source).toBe("seasonal");
    // 32000 seasonal + 5000 extra guest (3 - 2 included) = 37000 per night × 2
    expect(groupQuote.subtotal).toBe(74000);
  });

  it("enforces minStayNights across all matched plans, not only night 0", () => {
    const weekdayPlan: QuoteRatePlanInput = {
      ...basePlan,
      id: "plan-wd",
      code: "WD",
      weekdayOnly: true,
      minStayNights: 1,
      seasonals: [],
    };
    const weekendPlan: QuoteRatePlanInput = {
      ...basePlan,
      id: "plan-we",
      code: "WE",
      weekendOnly: true,
      minStayNights: 3,
      seasonals: [],
    };

    // 2026-12-04 (Fri, weekday) -> 2026-12-06 (Sun checkout): 2 nights total, touches Saturday (weekendPlan requires 3)
    expect(() =>
      computeAccommodationQuote([weekdayPlan, weekendPlan], {
        arrival: toDateOnlyUtc("2026-12-04"),
        departure: toDateOnlyUtc("2026-12-06"),
        occupants: 2,
      }),
    ).toThrow(/Minimum stay is 3 night/i);
  });
});

describe("P1 Stay accommodation billing sync planner", () => {
  it("creates initial charge on check-in and updates delta on extension without mutating HANDED_OFF lines", () => {
    const initial = computeAccommodationSyncPlan({
      totalNights: 3,
      unitPrice: 25000,
      handedOffNights: 0,
      unbilledChargeIds: [],
    });
    expect(initial).toEqual({
      action: "UPSERT_UNBILLED",
      targetQuantity: 3,
      unitPrice: 25000,
      existingChargeId: null,
      requiresCentralCreditNote: false,
    });

    // After 3 nights were handed off to SIGESC, guest extends to 5 nights -> only 2 unbilled delta nights
    const extensionDelta = computeAccommodationSyncPlan({
      totalNights: 5,
      unitPrice: 25000,
      handedOffNights: 3,
      unbilledChargeIds: ["charge-delta"],
    });
    expect(extensionDelta).toEqual({
      action: "UPSERT_UNBILLED",
      targetQuantity: 2,
      unitPrice: 25000,
      existingChargeId: "charge-delta",
      requiresCentralCreditNote: false,
    });
  });

  it("voids unbilled lines and flags central credit note when early departure drops below handed-off nights", () => {
    const early = computeAccommodationSyncPlan({
      totalNights: 2,
      unitPrice: 25000,
      handedOffNights: 3,
      unbilledChargeIds: ["charge-unbilled"],
    });
    expect(early).toEqual({
      action: "VOID_UNBILLED",
      chargeIdsToVoid: ["charge-unbilled"],
      requiresCentralCreditNote: true,
    });
  });
});
