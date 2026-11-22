import { describe, expect, it } from "vitest";
import {
  assertValidStayRange,
  rangesOverlap,
  toDateOnlyUtc,
} from "./availability";

describe("reservation availability helpers", () => {
  it("normalizes date-only UTC", () => {
    const d = toDateOnlyUtc("2026-12-01T15:30:00.000Z");
    expect(d.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rejects invalid stay ranges", () => {
    const a = toDateOnlyUtc("2026-12-01");
    const b = toDateOnlyUtc("2026-12-01");
    expect(() => assertValidStayRange(a, b)).toThrow(/after arrival/i);
  });

  it("detects half-open overlaps correctly", () => {
    const stay = {
      arrival: toDateOnlyUtc("2026-12-01"),
      departure: toDateOnlyUtc("2026-12-05"),
    };
    expect(
      rangesOverlap(stay, {
        arrival: toDateOnlyUtc("2026-12-04"),
        departure: toDateOnlyUtc("2026-12-08"),
      }),
    ).toBe(true);
    expect(
      rangesOverlap(stay, {
        arrival: toDateOnlyUtc("2026-12-05"),
        departure: toDateOnlyUtc("2026-12-08"),
      }),
    ).toBe(false);
    expect(
      rangesOverlap(stay, {
        arrival: toDateOnlyUtc("2026-11-20"),
        departure: toDateOnlyUtc("2026-12-01"),
      }),
    ).toBe(false);
  });
});
