/**
 * Individual reference-data item card (FR-002).
 *
 * Displays code, name, version, active/inactive badge, category,
 * description and change ownership. No mass values, no KPI.
 */

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import type { ReferenceItem } from "@/data/referencedata/types";
import { REFERENCE_CATEGORY_LABELS } from "@/data/referencedata/types";

interface ReferenceItemCardProps {
  item: ReferenceItem;
  /** Whether this card is currently selected/highlighted. */
  selected?: boolean;
  onSelect?: (code: string) => void;
}

export function ReferenceItemCard({ item, selected, onSelect }: ReferenceItemCardProps) {
  return (
    <Card
      className={cn(
        "transition-colors",
        selected && "ring-2 ring-sky-500",
        onSelect && "cursor-pointer hover:border-sky-300",
      )}
    >
      <CardContent>
        <button
          type="button"
          className="w-full text-left"
          aria-label={item.code}
          onClick={() => onSelect?.(item.code)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-slate-500 tabular-nums">{item.code}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{item.name}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Badge tone={item.active ? "ok" : "neutral"}>
                {item.active ? "Aktif" : "Nonaktif"}
              </Badge>
              <Badge tone="info">v{item.version}</Badge>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{item.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{REFERENCE_CATEGORY_LABELS[item.category]}</span>
            <span>Diubah oleh: {item.lastModifiedBy}</span>
            <span className="tabular-nums">{formatDateTime(item.lastModifiedAt)}</span>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}
