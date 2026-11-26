import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  resolveEffectivePermissions,
  SYSTEM_ROLES,
} from "@/modules/iam/permissions";
import { APP_NAV } from "@/components/layout/nav-config";
import {
  checkSameDayTurnaround,
  classifyReservationWindow,
  DEFAULT_HOTEL_SCHEDULE,
  evaluateReservationSchedule,
  getHotelTodayUtc,
} from "./schedule";

describe("Granular RBAC permission overrides & nav enforcement", () => {
  it("computes effective permissions as (rolePermissions ∪ GRANT) \\ DENY", () => {
    const base = ["dashboard.read", "reservations.read", "guests.read"];
    const effective = resolveEffectivePermissions(base, [
      { code: "integrations.invoices.settle", effect: "GRANT" },
      { code: "guests.read", effect: "DENY" },
    ]);

    expect(effective).toContain("dashboard.read");
    expect(effective).toContain("reservations.read");
    expect(effective).toContain("integrations.invoices.settle");
    expect(effective).not.toContain("guests.read");
  });

  it("assigns reservations.retroactive only to hotel_admin and manager by default", () => {
    const admin = SYSTEM_ROLES.find((r) => r.code === "hotel_admin");
    const manager = SYSTEM_ROLES.find((r) => r.code === "manager");
    const receptionist = SYSTEM_ROLES.find((r) => r.code === "receptionist");

    expect(admin?.permissions).toContain("reservations.retroactive");
    expect(manager?.permissions).toContain("reservations.retroactive");
    expect(receptionist?.permissions).not.toContain("reservations.retroactive");
  });

  it("maps every sidebar navigation item to a valid RBAC permission code", () => {
    const validCodes = new Set<string>(PERMISSIONS.map((p) => p.code));
    for (const item of APP_NAV) {
      expect(item.permission).toBeTruthy();
      expect(validCodes.has(item.permission!)).toBe(true);
    }
  });
});

describe("Reservation lifecycle classification (past, overdue, today, future)", () => {
  const today = new Date("2026-11-26T00:00:00Z");

  it("flags an expired past booking (15→20 viewed on 26th) as OVERDUE + isExpired so it never disappears", () => {
    const info = classifyReservationWindow(
      {
        status: "CONFIRMED",
        arrivalDate: "2026-11-15",
        departureDate: "2026-11-20",
      },
      today,
    );

    expect(info.bucket).toBe("OVERDUE");
    expect(info.isPastArrival).toBe(true);
    expect(info.isExpired).toBe(true);
    expect(info.isLateArrivalEligible).toBe(false);
  });

  it("marks a late arrival still within stay window (25→28 viewed on 26th) as OVERDUE + eligible for late check-in", () => {
    const info = classifyReservationWindow(
      {
        status: "CONFIRMED",
        arrivalDate: "2026-11-25",
        departureDate: "2026-11-28",
      },
      today,
    );

    expect(info.bucket).toBe("OVERDUE");
    expect(info.isExpired).toBe(false);
    expect(info.isLateArrivalEligible).toBe(true);
  });

  it("classifies TODAY, FUTURE, IN_HOUSE, and HISTORY accurately", () => {
    expect(
      classifyReservationWindow(
        { status: "CONFIRMED", arrivalDate: "2026-11-26", departureDate: "2026-11-29" },
        today,
      ).bucket,
    ).toBe("TODAY");

    expect(
      classifyReservationWindow(
        { status: "PENDING", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        today,
      ).bucket,
    ).toBe("FUTURE");

    expect(
      classifyReservationWindow(
        { status: "CHECKED_IN", arrivalDate: "2026-11-24", departureDate: "2026-11-28" },
        today,
      ).bucket,
    ).toBe("IN_HOUSE");

    expect(
      classifyReservationWindow(
        { status: "NO_SHOW", arrivalDate: "2026-11-15", departureDate: "2026-11-20" },
        today,
      ).bucket,
    ).toBe("HISTORY");
  });
});

describe("Hotel check-in/out schedule rules & same-day housekeeping turnaround", () => {
  it("defaults to hotel policy times and detects Early Check-in & Late Check-out", () => {
    const standard = evaluateReservationSchedule({ policy: DEFAULT_HOTEL_SCHEDULE });
    expect(standard.expectedCheckInTime).toBe("14:00");
    expect(standard.expectedCheckOutTime).toBe("12:00");
    expect(standard.earlyCheckInRequested).toBe(false);
    expect(standard.lateCheckOutRequested).toBe(false);
    expect(standard.warnings).toHaveLength(0);

    const earlyLate = evaluateReservationSchedule({
      expectedCheckInTime: "09:00",
      expectedCheckOutTime: "19:30",
      policy: DEFAULT_HOTEL_SCHEDULE,
    });
    expect(earlyLate.earlyCheckInRequested).toBe(true);
    expect(earlyLate.lateCheckOutRequested).toBe(true);
    expect(earlyLate.warnings).toHaveLength(2);
  });

  it("detects insufficient same-day housekeeping turnaround between departing and arriving guests", () => {
    const tight = checkSameDayTurnaround({
      departingCheckOutTime: "14:00",
      arrivingCheckInTime: "14:30",
      turnaroundMinutes: 60,
    });
    expect(tight.ok).toBe(false);
    expect(tight.gapMinutes).toBe(30);

    const safe = checkSameDayTurnaround({
      departingCheckOutTime: "12:00",
      arrivingCheckInTime: "14:00",
      turnaroundMinutes: 60,
    });
    expect(safe.ok).toBe(true);
    expect(safe.gapMinutes).toBe(120);
  });

  it("computes hotel local date cleanly in Africa/Luanda timezone", () => {
    // 2026-11-26 23:30 UTC is 2026-11-27 00:30 in Africa/Luanda (UTC+1)
    const d = getHotelTodayUtc("Africa/Luanda", new Date("2026-11-26T23:30:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-11-27");
  });
});
