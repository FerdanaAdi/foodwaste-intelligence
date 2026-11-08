/**
 * Reusable reference-data selector component (FR-002).
 *
 * A filtered dropdown/select for picking a reference item by category.
 * Intended for embedding in forms (e.g., measurement capture selects a
 * unit, event capture selects a stage or loss reason).
 *
 * Props-driven: data is injected, no internal fetch. The selector shows
 * only active items by default but can be configured to show all.
 */

import { useMemo } from "react";
import type { ReferenceCategory, ReferenceItem } from "@/data/referencedata/types";
import { REFERENCE_CATEGORY_LABELS } from "@/data/referencedata/types";

interface ReferenceSelectorProps {
  /** All reference items to pick from (typically the full fixture set). */
  items: readonly ReferenceItem[];
  /** Restrict selection to a single category. */
  category: ReferenceCategory;
  /** Currently selected item code, or "" for no selection. */
  value: string;
  /** Callback when selection changes. */
  onChange: (code: string) => void;
  /** Custom label for the selector. Defaults to category label. */
  label?: string;
  /** Whether to include inactive items (default: false). */
  showInactive?: boolean;
  /** HTML id for the select element. */
  id?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Disabled state. */
  disabled?: boolean;
}

export function ReferenceSelector({
  items,
  category,
  value,
  onChange,
  label,
  showInactive = false,
  id,
  placeholder,
  disabled,
}: ReferenceSelectorProps) {
  const filteredItems = useMemo(() => {
    return items.filter(
      (item) => item.category === category && (showInactive || item.active),
    );
  }, [items, category, showInactive]);

  const selectId = id ?? `ref-selector-${category}`;
  const displayLabel = label ?? REFERENCE_CATEGORY_LABELS[category];

  return (
    <div>
      <label htmlFor={selectId} className="block text-xs font-medium text-slate-600">
        {displayLabel}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder ?? `Pilih ${displayLabel.toLowerCase()}…`}</option>
        {filteredItems.map((item) => (
          <option key={item.code} value={item.code}>
            {item.code} — {item.name}
          </option>
        ))}
      </select>
      {filteredItems.length === 0 && (
        <p className="mt-1 text-xs text-slate-400">
          Tidak ada item {showInactive ? "" : "aktif "}dalam kategori ini.
        </p>
      )}
    </div>
  );
}

/**
 * Multi-category selector — renders a ReferenceSelector for each
 * requested category. Useful for forms needing multiple reference picks.
 */
interface MultiReferenceSelectorProps {
  items: readonly ReferenceItem[];
  categories: ReferenceCategory[];
  values: Record<string, string>;
  onChange: (category: ReferenceCategory, code: string) => void;
  showInactive?: boolean;
  disabled?: boolean;
}

export function MultiReferenceSelector({
  items,
  categories,
  values,
  onChange,
  showInactive,
  disabled,
}: MultiReferenceSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {categories.map((cat) => (
        <ReferenceSelector
          key={cat}
          items={items}
          category={cat}
          value={values[cat] ?? ""}
          onChange={(code) => onChange(cat, code)}
          showInactive={showInactive}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
