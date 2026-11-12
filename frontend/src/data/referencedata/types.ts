/**
 * FR-002 reference-data type definitions.
 *
 * Master data minimal — item pangan, kategori, unit, tahap, alasan/metode;
 * kode stabil, definisi/versi dan pemilik perubahan terlacak (PRD §7.1).
 *
 * These types are PROVISIONAL and fixture-backed only. They will be
 * reconciled with the backend schema when the API adapter is wired.
 * No KPI computation, no mass aggregation, no conversion factors.
 */

/**
 * Reference-data categories corresponding to FR-002 scope.
 * Each category holds master items with stable codes.
 */
export type ReferenceCategory =
  | "food_item"
  | "material_category"
  | "unit"
  | "stage"
  | "measurement_method"
  | "loss_reason";

export const REFERENCE_CATEGORIES: readonly ReferenceCategory[] = [
  "food_item",
  "material_category",
  "unit",
  "stage",
  "measurement_method",
  "loss_reason",
] as const;

export const REFERENCE_CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  food_item: "Item pangan",
  material_category: "Kategori material",
  unit: "Unit pengukuran",
  stage: "Tahap proses",
  measurement_method: "Metode pengukuran",
  loss_reason: "Alasan kehilangan",
};

/**
 * A single reference-data item with stable code, version and change tracking.
 *
 * Codes are stable identifiers (FR-002 acceptance: "kode stabil").
 * Version and lastModifiedBy provide change ownership traceability.
 */
export interface ReferenceItem {
  /** Stable, unique code within its category. */
  code: string;
  /** Human-readable display name (Indonesian). */
  name: string;
  /** Which reference-data category this item belongs to. */
  category: ReferenceCategory;
  /** Short description or definition. */
  description: string;
  /** Version string for change tracking (e.g., "1.0", "1.1"). */
  version: string;
  /** Whether this item is currently active in the vocabulary. */
  active: boolean;
  /** Identity of who last modified this item (synthetic). */
  lastModifiedBy: string;
  /** ISO datetime of last modification. */
  lastModifiedAt: string;
  /** Optional parent code for hierarchical items (e.g., sub-categories). */
  parentCode?: string;
  /** Optional key-value metadata for extensibility. */
  metadata?: Record<string, string>;
}

/** Filter state for reference-data catalog. */
export interface ReferenceFilterState {
  /** Text search across code, name and description. "" = no filter. */
  searchText: string;
  /** Category filter. "" = all categories. */
  category: "" | ReferenceCategory;
  /** Active status filter. "" = all, "active" = only active, "inactive" = only inactive. */
  activeFilter: "" | "active" | "inactive";
}

export const emptyReferenceFilters: ReferenceFilterState = {
  searchText: "",
  category: "",
  activeFilter: "",
};
