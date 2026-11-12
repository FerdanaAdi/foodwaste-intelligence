/**
 * FR-002 reference-data catalog logic.
 *
 * Pure functions for filtering, searching, grouping and summarizing
 * reference items. Counts only — no mass aggregation, no KPI formulas.
 * Data source is injected: fixtures now, backend adapter at integration.
 */

import type { ReferenceCategory, ReferenceFilterState, ReferenceItem } from "./types";
import { REFERENCE_CATEGORIES, REFERENCE_CATEGORY_LABELS } from "./types";

/** Summary counts per category. */
export interface CategorySummary {
  category: ReferenceCategory;
  label: string;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
}

/** Search items by text across code, name and description (case-insensitive). */
export function searchItems(items: readonly ReferenceItem[], searchText: string): ReferenceItem[] {
  if (!searchText.trim()) return [...items];
  const lower = searchText.toLowerCase().trim();
  return items.filter(
    (item) =>
      item.code.toLowerCase().includes(lower) ||
      item.name.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower),
  );
}

/** Filter items by category and active status. */
export function filterByCategory(items: readonly ReferenceItem[], category: "" | ReferenceCategory): ReferenceItem[] {
  if (!category) return [...items];
  return items.filter((item) => item.category === category);
}

/** Filter items by active/inactive status. */
export function filterByActive(items: readonly ReferenceItem[], activeFilter: "" | "active" | "inactive"): ReferenceItem[] {
  if (!activeFilter) return [...items];
  return items.filter((item) => (activeFilter === "active" ? item.active : !item.active));
}

/** Apply all filters (search + category + active). */
export function applyReferenceFilters(items: readonly ReferenceItem[], filters: ReferenceFilterState): ReferenceItem[] {
  let result = searchItems(items, filters.searchText);
  result = filterByCategory(result, filters.category);
  result = filterByActive(result, filters.activeFilter);
  return result;
}

/** Group items by category, preserving category order. */
export function groupByCategory(items: readonly ReferenceItem[]): Map<ReferenceCategory, ReferenceItem[]> {
  const groups = new Map<ReferenceCategory, ReferenceItem[]>();
  for (const cat of REFERENCE_CATEGORIES) {
    const catItems = items.filter((item) => item.category === cat);
    if (catItems.length > 0) {
      groups.set(cat, catItems);
    }
  }
  return groups;
}

/** Only active items. */
export function activeItems(items: readonly ReferenceItem[]): ReferenceItem[] {
  return items.filter((item) => item.active);
}

/** Summary counts per category. */
export function categorySummary(items: readonly ReferenceItem[]): CategorySummary[] {
  return REFERENCE_CATEGORIES.map((category) => {
    const catItems = items.filter((item) => item.category === category);
    return {
      category,
      label: REFERENCE_CATEGORY_LABELS[category],
      totalCount: catItems.length,
      activeCount: catItems.filter((item) => item.active).length,
      inactiveCount: catItems.filter((item) => !item.active).length,
    };
  }).filter((s) => s.totalCount > 0);
}

/** Total active and inactive counts. */
export function totalCounts(items: readonly ReferenceItem[]): { total: number; active: number; inactive: number } {
  const active = items.filter((item) => item.active).length;
  return { total: items.length, active, inactive: items.length - active };
}

/** Distinct versions found in items. */
export function distinctVersions(items: readonly ReferenceItem[]): string[] {
  return [...new Set(items.map((item) => item.version))].sort();
}

/** Distinct modifiers (lastModifiedBy). */
export function distinctModifiers(items: readonly ReferenceItem[]): string[] {
  return [...new Set(items.map((item) => item.lastModifiedBy))].sort();
}
