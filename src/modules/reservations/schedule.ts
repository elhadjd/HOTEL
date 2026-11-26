import type { ReservationStatus } from "@prisma/client";
import { toDateOnlyUtc } from "./availability";

export type HotelSchedulePolicy = {
  checkInTime: string;
  checkOutTime: string;
  earlyCheckInFrom: string;
  lateCheckOutUntil: string;
  housekeepingTurnaroundMinutes: number;
  noShowCutoffTime: string;
  timezone: string;
};

export const DEFAULT_HOTEL_SCHEDULE: HotelSchedulePolicy = {
  checkInTime: "14:00",
  checkOutTime: "12:00",
  earlyCheckInFrom: "10:00",
  lateCheckOutUntil: "18:00",
  housekeepingTurnaroundMinutes: 60,
  noShowCutoffTime: "23:59",
  timezone: "Africa/Luanda",
};

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeHHMM(value: string | null | undefined): boolean {
  if (!value) return false;
  return HHMM_RE.test(value.trim());
}

export function normalizeTimeHHMM(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim();
  if (trimmed && HHMM_RE.test(trimmed)) return trimmed;
  return fallback;
}

export function timeToMinutes(hhmm: string): number {
  const match = HHMM_RE.exec(hhmm.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Returns today's calendar date (00:00:00 UTC) as observed in the hotel's timezone.
 * Prevents midnight drift where UTC date differs from Africa/Luanda or local time.
 */
export function getHotelTodayUtc(
  timezone = DEFAULT_HOTEL_SCHEDULE.timezone,
  now: Date = new Date(),
): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(Date.UTC(y, m - 1, d));
    }
  } catch {
    // Fallback to UTC date if Intl timezone is unsupported
  }
  return toDateOnlyUtc(now);
}

export type ReservationLifecycleBucket =
  | "TODAY"
  | "FUTURE"
  | "IN_HOUSE"
  | "OVERDUE"
  | "HISTORY";

export type ReservationWindowInfo = {
  bucket: ReservationLifecycleBucket;
  isPastArrival: boolean;
  isExpired: boolean;
  isLateArrivalEligible: boolean;
};

/**
 * Deterministic classification so NO reservation ever disappears from the system:
 * - CHECKED_IN => IN_HOUSE
 * - CHECKED_OUT / NO_SHOW / CANCELLED => HISTORY
 * - PENDING / CONFIRMED / DRAFT:
 *     - arrival === today => TODAY
 *     - arrival > today => FUTURE
 *     - arrival < today && departure > today => OVERDUE (late arrival still eligible for check-in)
 *     - arrival < today && departure <= today => OVERDUE (expired — pending No-Show/Reschedule, must NEVER lock room today)
 */
export function classifyReservationWindow(
  reservation: {
    status: ReservationStatus;
    arrivalDate: Date | string;
    departureDate: Date | string;
  },
  todayUtc: Date,
): ReservationWindowInfo {
  const todayMs = toDateOnlyUtc(todayUtc).getTime();
  const arrivalMs = toDateOnlyUtc(reservation.arrivalDate).getTime();
  const departureMs = toDateOnlyUtc(reservation.departureDate).getTime();

  if (reservation.status === "CHECKED_IN") {
    return {
      bucket: "IN_HOUSE",
      isPastArrival: arrivalMs < todayMs,
      isExpired: departureMs < todayMs,
      isLateArrivalEligible: false,
    };
  }

  if (
    reservation.status === "CHECKED_OUT" ||
    reservation.status === "NO_SHOW" ||
    reservation.status === "CANCELLED"
  ) {
    return {
      bucket: "HISTORY",
      isPastArrival: arrivalMs < todayMs,
      isExpired: departureMs <= todayMs,
      isLateArrivalEligible: false,
    };
  }

  if (arrivalMs === todayMs) {
    return {
      bucket: "TODAY",
      isPastArrival: false,
      isExpired: false,
      isLateArrivalEligible: false,
    };
  }

  if (arrivalMs > todayMs) {
    return {
      bucket: "FUTURE",
      isPastArrival: false,
      isExpired: false,
      isLateArrivalEligible: false,
    };
  }

  const isExpired = departureMs <= todayMs;
  return {
    bucket: "OVERDUE",
    isPastArrival: true,
    isExpired,
    isLateArrivalEligible: !isExpired,
  };
}

export function evaluateReservationSchedule(params: {
  expectedCheckInTime?: string | null;
  expectedCheckOutTime?: string | null;
  policy?: Partial<HotelSchedulePolicy> | null;
}): {
  expectedCheckInTime: string;
  expectedCheckOutTime: string;
  earlyCheckInRequested: boolean;
  lateCheckOutRequested: boolean;
  warnings: string[];
} {
  const policy: HotelSchedulePolicy = {
    ...DEFAULT_HOTEL_SCHEDULE,
    ...(params.policy ?? {}),
  };
  const expectedCheckInTime = normalizeTimeHHMM(
    params.expectedCheckInTime,
    policy.checkInTime,
  );
  const expectedCheckOutTime = normalizeTimeHHMM(
    params.expectedCheckOutTime,
    policy.checkOutTime,
  );

  const checkInMins = timeToMinutes(expectedCheckInTime);
  const stdCheckInMins = timeToMinutes(policy.checkInTime);
  const earlyMinMins = timeToMinutes(policy.earlyCheckInFrom);

  const checkOutMins = timeToMinutes(expectedCheckOutTime);
  const stdCheckOutMins = timeToMinutes(policy.checkOutTime);
  const lateMaxMins = timeToMinutes(policy.lateCheckOutUntil);

  const earlyCheckInRequested = checkInMins < stdCheckInMins;
  const lateCheckOutRequested = checkOutMins > stdCheckOutMins;
  const warnings: string[] = [];

  if (checkInMins < earlyMinMins) {
    warnings.push(
      `Chegada prevista (${expectedCheckInTime}) é anterior ao limite de early check-in do hotel (${policy.earlyCheckInFrom}).`,
    );
  }
  if (checkOutMins > lateMaxMins) {
    warnings.push(
      `Saída prevista (${expectedCheckOutTime}) ultrapassa o limite de late check-out do hotel (${policy.lateCheckOutUntil}) — pode exigir diária adicional.`,
    );
  }

  return {
    expectedCheckInTime,
    expectedCheckOutTime,
    earlyCheckInRequested,
    lateCheckOutRequested,
    warnings,
  };
}

/**
 * Checks whether a same-day room turnover leaves enough housekeeping turnaround time
 * between the departing guest's expected check-out and the arriving guest's expected check-in.
 */
export function checkSameDayTurnaround(params: {
  departingCheckOutTime: string;
  arrivingCheckInTime: string;
  turnaroundMinutes: number;
}): { ok: boolean; gapMinutes: number; requiredMinutes: number } {
  const outMins = timeToMinutes(params.departingCheckOutTime);
  const inMins = timeToMinutes(params.arrivingCheckInTime);
  const gapMinutes = inMins - outMins;
  return {
    ok: gapMinutes >= params.turnaroundMinutes,
    gapMinutes,
    requiredMinutes: params.turnaroundMinutes,
  };
}
