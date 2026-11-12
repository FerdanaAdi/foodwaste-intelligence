/**
 * Unit tests for FR-002 reference-data catalog logic.
 *
 * Tests pure functions: filtering, searching, grouping, counts.
 * No component rendering. Pattern follows dq-summary.test.ts.
 */

import { describe, expect, it } from "vitest";
import {
  activeItems,
  applyReferenceFilters,
  categorySummary,
  distinctModifiers,
  distinctVersions,
  filterByActive,
  filterByCategory,
  groupByCategory,
  searchItems,
  totalCounts,
} from "@/data/referencedata/catalog";
import { referenceFixtures } from "@/data/referencedata/fixtures";
import type { ReferenceFilterState } from "@/data/referencedata/types";
import { emptyReferenceFilters } from "@/data/referencedata/types";

const items = referenceFixtures;

describe("searchItems — text search across code, name, description", () => {
  it("returns all items when search text is empty", () => {
    expect(searchItems(items, "")).toHaveLength(items.length);
    expect(searchItems(items, "  ")).toHaveLength(items.length);
  });

  it("finds items by code (case-insensitive)", () => {
    const result = searchItems(items, "fi-001");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("FI-001");
  });

  it("finds items by name fragment", () => {
    const result = searchItems(items, "bayam");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("FI-002");
  });

  it("finds items by description fragment", () => {
    const result = searchItems(items, "karbohidrat");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((i) => i.code === "MC-001")).toBe(true);
  });

  it("returns empty array for no matches", () => {
    expect(searchItems(items, "xyz-no-match")).toHaveLength(0);
  });

  it("finds items matching [SYNTHETIC] marker", () => {
    const result = searchItems(items, "SYNTHETIC");
    expect(result).toHaveLength(items.length); // All items have [SYNTHETIC]
  });
});

describe("filterByCategory — category filtering", () => {
  it("returns all items when category is empty", () => {
    expect(filterByCategory(items, "")).toHaveLength(items.length);
  });

  it("filters to food_item category", () => {
    const result = filterByCategory(items, "food_item");
    expect(result.length).toBe(5);
    expect(result.every((i) => i.category === "food_item")).toBe(true);
  });

  it("filters to unit category", () => {
    const result = filterByCategory(items, "unit");
    expect(result.length).toBe(3);
    expect(result.every((i) => i.category === "unit")).toBe(true);
  });

  it("filters to loss_reason category", () => {
    const result = filterByCategory(items, "loss_reason");
    expect(result.length).toBe(6);
    expect(result.every((i) => i.category === "loss_reason")).toBe(true);
  });
});

describe("filterByActive — active/inactive filtering", () => {
  it("returns all items when filter is empty", () => {
    expect(filterByActive(items, "")).toHaveLength(items.length);
  });

  it("filters to active items only", () => {
    const result = filterByActive(items, "active");
    expect(result.every((i) => i.active)).toBe(true);
    expect(result.length).toBeLessThan(items.length);
  });

  it("filters to inactive items only", () => {
    const result = filterByActive(items, "inactive");
    expect(result.every((i) => !i.active)).toBe(true);
    // Fixtures: FI-005, UN-003, LR-006 are inactive
    expect(result.length).toBe(3);
  });
});

describe("applyReferenceFilters — combined filtering", () => {
  it("returns all items with empty filters", () => {
    expect(applyReferenceFilters(items, emptyReferenceFilters)).toHaveLength(items.length);
  });

  it("combines search + category + active filter", () => {
    const filters: ReferenceFilterState = {
      searchText: "SYNTHETIC",
      category: "food_item",
      activeFilter: "active",
    };
    const result = applyReferenceFilters(items, filters);
    expect(result.length).toBe(4); // 5 food items minus 1 inactive (FI-005)
    expect(result.every((i) => i.category === "food_item" && i.active)).toBe(true);
  });

  it("returns empty when filters exclude everything", () => {
    const filters: ReferenceFilterState = {
      searchText: "ayam",
      category: "unit",
      activeFilter: "",
    };
    expect(applyReferenceFilters(items, filters)).toHaveLength(0);
  });
});

describe("groupByCategory — preserves category order", () => {
  it("groups all items by their category", () => {
    const groups = groupByCategory(items);
    expect(groups.size).toBe(6); // 6 categories with items
    // First entry should be food_item (matches REFERENCE_CATEGORIES order)
    const keys = Array.from(groups.keys());
    expect(keys[0]).toBe("food_item");
    expect(keys[1]).toBe("material_category");
  });

  it("groups filtered items correctly", () => {
    const activeOnly = activeItems(items);
    const groups = groupByCategory(activeOnly);
    // food_item has 4 active (FI-005 inactive excluded)
    expect(groups.get("food_item")).toHaveLength(4);
  });
});

describe("activeItems — active items only", () => {
  it("excludes inactive items", () => {
    const result = activeItems(items);
    expect(result.every((i) => i.active)).toBe(true);
    expect(result.length).toBe(items.length - 3); // 3 inactive items
  });
});

describe("categorySummary — count summary per category", () => {
  it("provides correct counts for each category", () => {
    const summary = categorySummary(items);
    expect(summary.length).toBe(6);

    const foodItems = summary.find((s) => s.category === "food_item");
    expect(foodItems).toBeDefined();
    expect(foodItems!.totalCount).toBe(5);
    expect(foodItems!.activeCount).toBe(4);
    expect(foodItems!.inactiveCount).toBe(1);
  });

  it("excludes categories with zero items", () => {
    const emptyItems = items.filter((i) => i.category === "food_item");
    const summary = categorySummary(emptyItems);
    expect(summary.length).toBe(1);
    expect(summary[0].category).toBe("food_item");
  });
});

describe("totalCounts — aggregate counts", () => {
  it("counts all items correctly", () => {
    const counts = totalCounts(items);
    expect(counts.total).toBe(items.length);
    expect(counts.active + counts.inactive).toBe(counts.total);
    expect(counts.inactive).toBe(3);
  });

  it("handles empty array", () => {
    const counts = totalCounts([]);
    expect(counts.total).toBe(0);
    expect(counts.active).toBe(0);
    expect(counts.inactive).toBe(0);
  });
});

describe("distinctVersions and distinctModifiers", () => {
  it("extracts sorted unique versions", () => {
    const versions = distinctVersions(items);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions).toContain("1.0");
    expect(versions).toContain("1.1");
    // Sorted
    expect(versions).toEqual([...versions].sort());
  });

  it("extracts sorted unique modifiers", () => {
    const modifiers = distinctModifiers(items);
    expect(modifiers).toContain("demo-admin");
    expect(modifiers).toContain("demo-editor");
    expect(modifiers).toEqual([...modifiers].sort());
  });
});
