/**
 * Data-quality summary and filtering model (FR-007 / UI-02).
 *
 * Counts only: no mass aggregation, no cross-basis totals, no KPI
 * formulas (OP-08/FI-02/NI-03 stay HELD and unused). "Needs attention"
 * counts records requiring review (needs_review/flagged); it is NOT a
 * canonical blocked status — a true blocked result (a validation
 * requirement failed so the record cannot be accepted/calculated) has
 * no status value in the current model and is a pending mapping gap.
 */

import type { DemoData, Measurement, ObservationStatus, Site, ValidationStatus, WasteEvent } from "@/domain/types";
import { OBSERVATION_STATUS_LABELS, VALIDATION_STATUS_LABELS } from "@/domain/types";

export interface DataQualitySummary {
  eventCount: number;
  measurementCount: number;
  observationCounts: Record<ObservationStatus, number>;
  validationCounts: Record<ValidationStatus, number>;
  /** missing + not_measured — never counted as zero. */
  missingCount: number;
  /** needs_review + flagged — requires attention/validation; NOT "blocked". */
  needsAttentionCount: number;
  /** Events with 0 measurements (event identity still stands). */
  unmeasuredEventCount: number;
  estimatedCount: number;
}

export function summarize(events: WasteEvent[], measurements: Measurement[]): DataQualitySummary {
  const observationCounts: Record<ObservationStatus, number> = {
    observed: 0,
    measured_zero: 0,
    missing: 0,
    not_measured: 0,
  };
  for (const m of measurements) observationCounts[m.observationStatus] += 1;

  const validationCounts: Record<ValidationStatus, number> = {
    unvalidated: 0,
    needs_review: 0,
    flagged: 0,
  };
  for (const m of measurements) validationCounts[m.validationStatus] += 1;

  return {
    eventCount: events.length,
    measurementCount: measurements.length,
    observationCounts,
    validationCounts,
    missingCount: observationCounts.missing + observationCounts.not_measured,
    needsAttentionCount: validationCounts.needs_review + validationCounts.flagged,
    unmeasuredEventCount: events.filter((e) => !measurements.some((m) => m.eventId === e.eventId)).length,
    estimatedCount: measurements.filter((m) => m.estimationStatus === "estimated").length,
  };
}

export interface DataQualityFilterState {
  /** "" = all sites. */
  siteId: string;
  /** "" = all stages (free vocabulary from event records, PROVISIONAL). */
  stage: string;
  /** Inclusive operation-date lower bound (ISO date, "" = open). */
  operationFrom: string;
  /** Inclusive operation-date upper bound (ISO date, "" = open). */
  operationTo: string;
  /** "" = all observation statuses. */
  observationStatus: "" | ObservationStatus;
  /** "" = all validation statuses. */
  validationStatus: "" | ValidationStatus;
}

export const emptyFilters: DataQualityFilterState = {
  siteId: "",
  stage: "",
  operationFrom: "",
  operationTo: "",
  observationStatus: "",
  validationStatus: "",
};

export interface SiteOption {
  siteId: string;
  name: string;
}

export function siteOptions(sites: Site[]): SiteOption[] {
  return sites.map((s) => ({ siteId: s.siteId, name: s.name }));
}

/** Stage vocabulary derived from the records themselves (no invented master data). */
export function stageOptions(events: WasteEvent[]): string[] {
  return [...new Set(events.map((e) => e.stage))].sort();
}

/** One event joined with its 0..n measurement records (event ≠ measurement). */
export interface EventRecord {
  event: WasteEvent;
  measurements: Measurement[];
  /** Count from supplied source relationships, before measurement-status filters. */
  recordedMeasurementCount: number;
}

function measurementMatches(m: Measurement, filters: DataQualityFilterState): boolean {
  if (filters.observationStatus && m.observationStatus !== filters.observationStatus) return false;
  if (filters.validationStatus && m.validationStatus !== filters.validationStatus) return false;
  return true;
}

/**
 * Apply filters to events + their measurements. An event survives if it
 * passes the event-level filters; measurement-level status filters keep
 * only matching measurement records (an event can remain listed with 0
 * matching measurements so event counts stay honest). Source counts remain
 * separate; callers must supply already authorized data — filters are not auth.
 */
export function applyFilters(data: Pick<DemoData, "sites" | "events" | "measurements">, filters: DataQualityFilterState): EventRecord[] {
  const byEvent = new Map<string, Measurement[]>();
  for (const m of data.measurements) {
    const list = byEvent.get(m.eventId) ?? [];
    list.push(m);
    byEvent.set(m.eventId, list);
  }
  return data.events
    .filter((e) => {
      if (filters.siteId && e.siteId !== filters.siteId) return false;
      if (filters.stage && e.stage !== filters.stage) return false;
      if (filters.operationFrom && e.operationDate < filters.operationFrom) return false;
      if (filters.operationTo && e.operationDate > filters.operationTo) return false;
      return true;
    })
    .map((event) => {
      const recorded = byEvent.get(event.eventId) ?? [];
      return {
        event,
        measurements: recorded.filter((m) => measurementMatches(m, filters)),
        recordedMeasurementCount: recorded.length,
      };
    });
}

/** Counts summary for an already-filtered record list. */
export function summarizeRecords(records: EventRecord[]): DataQualitySummary {
  const events = records.map((r) => r.event);
  const measurements = records.flatMap((r) => r.measurements);
  return {
    ...summarize(events, measurements),
    // Only surviving site/date/stage-scoped events; hidden observations are not absent.
    unmeasuredEventCount: records.filter((r) => r.recordedMeasurementCount === 0).length,
  };
}

export const OBSERVATION_STATUS_OPTIONS = (
  Object.keys(OBSERVATION_STATUS_LABELS) as ObservationStatus[]
).map((value) => ({ value, label: OBSERVATION_STATUS_LABELS[value] }));

export const VALIDATION_STATUS_OPTIONS = (
  Object.keys(VALIDATION_STATUS_LABELS) as ValidationStatus[]
).map((value) => ({ value, label: VALIDATION_STATUS_LABELS[value] }));
