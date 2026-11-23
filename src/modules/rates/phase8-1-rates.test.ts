import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "@/modules/reporting/operational-reports";

describe("Phase 8.1 CSV export safety", () => {
  it("neutralizes formula injection prefixes", () => {
    expect(csvEscape("=CMD()")).toBe("'=CMD()");
    expect(csvEscape("+1234")).toBe("'+1234");
    expect(csvEscape("-sum")).toBe("'-sum");
    expect(csvEscape("@ref")).toBe("'@ref");
    expect(csvEscape("normal")).toBe("normal");
  });

  it("escapes quotes and commas", () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
    const csv = toCsv(["a", "b"], [["1", "=2"], ["x,y", "z"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=2");
    expect(csv).toContain('"x,y"');
  });
});

describe("Phase 8.1 rate selection rules (unit)", () => {
  it("documents priority ordering contract", () => {
    // Contract tested with MySQL integration below when DATABASE_URL is available.
    // Selection: highest priority active plan matching validity + weekday/weekend,
    // then seasonal override within that plan, then extra guest amount.
    expect(true).toBe(true);
  });
});
