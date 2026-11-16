import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { assertCurrent, authSnapshot, subscribeAuth } from "@/backend/auth";
import { readBackendEvent, readBackendMeasurements } from "@/backend/client";
import { isUUID, type BackendEvent, type BackendMeasurement } from "@/backend/contract";
import { readDelivery, type Delivery, type Recommendation } from "@/backend/p1";

export type AlertSource = Pick<Recommendation, "recommendation_id" | "organization_id" | "site_id" |
  "target_type" | "target_ref" | "rule_code" | "rule_version" | "recorded_at">;
type SourceData = { kind: "event"; event: BackendEvent; measurements: BackendMeasurement[] } |
  { kind: "delivery"; delivery: Delivery };
type SourceState = { key: string; phase: "loading" | "ready" | "error" | "unavailable"; data?: SourceData };

/** Include generation: site/session A -> B -> A must never reuse A's old result. */
export function alertContextKey(auth: ReturnType<typeof authSnapshot>) {
  return JSON.stringify([auth.phase, auth.generation, auth.session?.principal_id,
    auth.session?.auth_context_id, auth.site]);
}

export function useAlertSource(alert: AlertSource) {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot);
  const key = JSON.stringify([alertContextKey(auth), alert.recommendation_id, alert.site_id,
    alert.organization_id, alert.target_type, alert.target_ref, alert.rule_version, alert.recorded_at]);
  const allowed = auth.phase === "ready" && !!auth.session && alert.site_id === auth.site;
  const supported = isUUID(alert.target_ref) && ["waste_event", "delivery"].includes(alert.target_type);
  const [state, setState] = useState<SourceState>({ key, phase: "loading" });
  const sequence = useRef(0);
  useEffect(() => {
    const request = ++sequence.current;
    const controller = new AbortController();
    let active = true;
    const current = () => active && !controller.signal.aborted && request === sequence.current;
    if (!allowed || !supported) {
      setState({ key, phase: "unavailable" });
      return () => { active = false; controller.abort(); };
    }
    const expected = authSnapshot();
    setState({ key, phase: "loading" });
    void (async (): Promise<SourceData> => {
      assertCurrent(expected);
      if (alert.target_type === "waste_event") {
        const [event, measurements] = await Promise.all([
          readBackendEvent(alert.target_ref, controller.signal),
          readBackendMeasurements(alert.target_ref, controller.signal),
        ]);
        assertCurrent(expected);
        if (event.event_id !== alert.target_ref || event.site_id !== expected.site ||
            event.organization_id !== alert.organization_id ||
            measurements.some(row => row.event_id !== event.event_id)) throw new Error("Source context mismatch");
        return { kind: "event", event, measurements };
      }
      const delivery = await readDelivery(alert.target_ref, controller.signal);
      assertCurrent(expected);
      if (delivery.delivery_id !== alert.target_ref || delivery.organization_id !== alert.organization_id ||
          ![delivery.from_site_id, delivery.to_site_id].includes(expected.site)) throw new Error("Source context mismatch");
      return { kind: "delivery", delivery };
    })().then(data => {
      if (!current()) return;
      assertCurrent(expected);
      setState({ key, phase: "ready", data });
    }).catch(() => { if (current()) setState({ key, phase: "error" }); });
    return () => { active = false; controller.abort(); };
    // key includes every source/auth identity; no source result crosses a context boundary.
  }, [key, allowed, supported]);
  // Synchronous render guard: an effect has not yet cleared the old data at this point.
  if (!allowed || !supported) return { phase: "unavailable" as const, contextInvalid: !allowed };
  return state.key === key ? state : { phase: "loading" as const };
}
