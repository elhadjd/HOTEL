import { describe, expect, it } from "vitest";
import { filterSearchableOptions, type SearchableOption } from "./searchable-select";

const options: SearchableOption[] = [
  {
    value: "1",
    label: "Água Mineral",
    keywords: ["SKU-AGUA", "bebida"],
    description: "Garrafa 50cl",
  },
  {
    value: "2",
    label: "Maria Silva",
    keywords: ["maria@hotel.ao", "+244900000001"],
  },
  {
    value: "3",
    label: "Quarto 101",
    keywords: ["101", "standard"],
  },
];

describe("filterSearchableOptions", () => {
  it("filters by label (case/accent insensitive)", () => {
    expect(filterSearchableOptions(options, "agua").map((o) => o.value)).toEqual(["1"]);
    expect(filterSearchableOptions(options, "ÁGUA").map((o) => o.value)).toEqual(["1"]);
  });

  it("filters by SKU / reference keywords", () => {
    expect(filterSearchableOptions(options, "sku-agua").map((o) => o.value)).toEqual(["1"]);
  });

  it("filters by email and phone", () => {
    expect(filterSearchableOptions(options, "maria@hotel").map((o) => o.value)).toEqual(["2"]);
    expect(filterSearchableOptions(options, "900000001").map((o) => o.value)).toEqual(["2"]);
  });

  it("returns empty results when nothing matches", () => {
    expect(filterSearchableOptions(options, "zzzz-missing")).toEqual([]);
  });

  it("caps large lists", () => {
    const large = Array.from({ length: 500 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
      keywords: [`CODE-${i}`],
    }));
    expect(filterSearchableOptions(large, "item", 50)).toHaveLength(50);
    expect(filterSearchableOptions(large, "CODE-42").map((o) => o.value)).toContain("42");
    expect(filterSearchableOptions(large, "CODE-42").length).toBeLessThanOrEqual(50);
  });

  it("returns all when query is empty", () => {
    expect(filterSearchableOptions(options, "")).toHaveLength(3);
  });
});
