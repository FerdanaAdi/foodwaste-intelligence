/**
 * Detail view for a single reference-data item (FR-002).
 *
 * Shows full metadata: code, name, category, version, status,
 * description, change ownership, and optional metadata entries.
 * No mass values, no KPI, no conversion factors.
 */

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils";
import type { ReferenceItem } from "@/data/referencedata/types";
import { REFERENCE_CATEGORY_LABELS } from "@/data/referencedata/types";

interface ReferenceDetailProps {
  item: ReferenceItem;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="text-xs font-medium text-slate-500 sm:w-40 sm:flex-shrink-0">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function ReferenceDetail({ item }: ReferenceDetailProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-label={`Detail ${item.code}`}>Detail: {item.code}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <section
          aria-label={`Detail item referensi ${item.code}`}
          role="region"
        >
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
            <Badge tone={item.active ? "ok" : "neutral"}>
              {item.active ? "Aktif" : "Nonaktif"}
            </Badge>
            <Badge tone="info">v{item.version}</Badge>
          </div>

          <dl className="space-y-2">
            <DetailRow label="Kode" value={item.code} />
            <DetailRow label="Kategori" value={REFERENCE_CATEGORY_LABELS[item.category]} />
            <DetailRow label="Deskripsi" value={item.description} />
            <DetailRow label="Versi" value={item.version} />
            <DetailRow label="Status" value={item.active ? "Aktif" : "Nonaktif"} />
            <DetailRow label="Terakhir diubah oleh" value={item.lastModifiedBy} />
            <DetailRow label="Waktu perubahan" value={formatDateTime(item.lastModifiedAt)} />
            {item.parentCode && <DetailRow label="Kode induk" value={item.parentCode} />}
          </dl>

          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-medium text-slate-500 mb-1">Metadata tambahan</h4>
              <dl className="space-y-1">
                {Object.entries(item.metadata).map(([key, value]) => (
                  <DetailRow key={key} label={key} value={value} />
                ))}
              </dl>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Data sintetis untuk demo — bukan data referensi resmi.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
