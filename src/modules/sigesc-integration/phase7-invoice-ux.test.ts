import { describe, expect, it } from "vitest";
import {
  assertEditableCentralState,
  isEditableCentralState,
  summarizeInvoiceLines,
  EDITABLE_CENTRAL_STATES,
  READONLY_CENTRAL_STATES,
} from "./invoices/invoice-service";

describe("Phase 7 invoice status guards", () => {
  it("allows Cotação and Proforma", () => {
    expect(isEditableCentralState("Cotação")).toBe(true);
    expect(isEditableCentralState("Proforma")).toBe(true);
    expect(() => assertEditableCentralState("Cotação")).not.toThrow();
  });

  it("rejects Publicado / Pago / Cancelado", () => {
    for (const state of READONLY_CENTRAL_STATES) {
      expect(isEditableCentralState(state)).toBe(false);
      expect(() => assertEditableCentralState(state)).toThrow(/read-only/i);
    }
  });

  it("blocks unknown / empty central status", () => {
    expect(isEditableCentralState(null)).toBe(false);
    expect(isEditableCentralState(undefined)).toBe(false);
    expect(isEditableCentralState("")).toBe(false);
    expect(() => assertEditableCentralState(null)).toThrow(/Unknown|unavailable/i);
    expect(() => assertEditableCentralState("WeirdState")).toThrow(/read-only/i);
  });

  it("keeps editable and readonly sets disjoint", () => {
    for (const state of EDITABLE_CENTRAL_STATES) {
      expect(READONLY_CENTRAL_STATES.has(state)).toBe(false);
    }
  });
});

describe("Phase 7 invoice line summary", () => {
  it("computes item counts, quantities and discounts from linesJson", () => {
    const summary = summarizeInvoiceLines({
      lines: [
        { quantity: 2, unit_price: 1000, discount: 100 },
        { quantity: 1, unit_price: 500, discount: 0 },
      ],
    });
    expect(summary.itemCount).toBe(2);
    expect(summary.totalQuantity).toBe(3);
    expect(summary.subtotal).toBe(2500);
    expect(summary.discount).toBe(100);
  });

  it("handles empty lines safely", () => {
    expect(summarizeInvoiceLines({})).toEqual({
      itemCount: 0,
      totalQuantity: 0,
      subtotal: 0,
      discount: 0,
      currencyHint: "AOA",
    });
  });
});
