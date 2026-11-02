import {
  EvidenceEvent,
  classifyIncoming,
  compareEvents,
} from './index.js';

/**
 * Spaced-review scheduling derived from the event log (Pillar 5, F2).
 *
 * Pure kernel module: no clock, no randomness, no I/O. Time values come
 * only from event fields (occurred_at) and from the injected config.
 * The review schedule is NEVER stored; it is recomputed from the log.
 */

export interface ReviewConfig {
  steps_ms: number[];
  relearn_delay_ms: number;
}

export interface ReviewInfo {
  streak: number;
  last_usable_at: string | null;
  due_at: string | null;
}

/**
 * Local copy of the canonical serializer kept private in index.ts.
 * Used only to pick a deterministic winner when duplicate event ids
 * carry different content (same behaviour as deriveUnitState).
 */
function canonicalSerialize(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalSerialize).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalSerialize(obj[k])).join(',') + '}';
}

/**
 * Event selection mirrors deriveUnitState exactly: keep events whose
 * unit_refs include unitId and that classifyIncoming marks "valid";
 * dedupe by event_id (first occurrence wins for identical duplicates;
 * conflicting duplicates resolve to the earliest by (occurred_at,
 * event_id, canonical) so arrival order never matters); exclude events
 * referenced by another surviving event's corrects_event_id; sort with
 * compareEvents.
 */
function selectUnitEvents(unitId: string, events: readonly unknown[]): EvidenceEvent[] {
  const validForUnit: EvidenceEvent[] = [];
  for (const raw of events) {
    if (typeof raw !== 'object' || raw === null) continue;
    const candidate = raw as Record<string, unknown>;
    if (!Array.isArray(candidate.unit_refs)) continue;
    if (!(candidate.unit_refs as unknown[]).includes(unitId)) continue;
    if (classifyIncoming(raw) !== 'valid') continue;
    validForUnit.push(raw as EvidenceEvent);
  }

  const groups = new Map<string, EvidenceEvent[]>();
  for (const ev of validForUnit) {
    const list = groups.get(ev.event_id) || [];
    list.push(ev);
    groups.set(ev.event_id, list);
  }

  const deduped: EvidenceEvent[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
    } else {
      const firstCanonical = canonicalSerialize(group[0]);
      let allIdentical = true;
      for (let i = 1; i < group.length; i++) {
        if (canonicalSerialize(group[i]) !== firstCanonical) {
          allIdentical = false;
          break;
        }
      }
      if (allIdentical) {
        deduped.push(group[0]);
      } else {
        const sortedGroup = [...group].sort((a, b) => {
          const comp = compareEvents(a, b);
          if (comp !== 0) return comp;
          const sA = canonicalSerialize(a);
          const sB = canonicalSerialize(b);
          if (sA < sB) return -1;
          if (sA > sB) return 1;
          return 0;
        });
        deduped.push(sortedGroup[0]);
      }
    }
  }

  const correctedEventIds = new Set<string>();
  for (const ev of deduped) {
    if (ev.corrects_event_id) {
      correctedEventIds.add(ev.corrects_event_id);
    }
  }

  const eventsToReplay = deduped.filter(e => !correctedEventIds.has(e.event_id));
  eventsToReplay.sort(compareEvents);
  return eventsToReplay;
}

/**
 * Derive the review schedule for one unit from its events.
 *
 * Only USABLE events (reliability "usable" and result not
 * "not_assessable") are considered, and self_report events are ignored.
 *
 * Replay with streak = 0 and due = null:
 * - result "correct" at time t: if due is null or t >= due, then
 *   streak += 1 and due = t + steps_ms[min(streak - 1, last)]; a repeat
 *   before the due time changes nothing;
 * - result "incorrect" at time t: streak = 0 and due = t + relearn_delay_ms;
 * - result "partial": changes nothing.
 *
 * last_usable_at is the occurred_at of the last considered event;
 * due_at is an ISO-8601 UTC string or null.
 */
export function deriveReviewInfo(
  unitId: string,
  events: readonly unknown[],
  config: ReviewConfig
): ReviewInfo {
  const selected = selectUnitEvents(unitId, events);

  let streak = 0;
  let dueMs: number | null = null;
  let lastUsableAt: string | null = null;

  for (const ev of selected) {
    if (ev.payload_type === 'self_report') continue;
    const isUsable = ev.reliability === 'usable' && ev.result !== 'not_assessable';
    if (!isUsable) continue;

    lastUsableAt = ev.occurred_at;
    const t = Date.parse(ev.occurred_at);

    if (ev.result === 'correct') {
      if (dueMs === null || t >= dueMs) {
        streak += 1;
        const stepIndex = Math.min(streak - 1, config.steps_ms.length - 1);
        const stepMs = config.steps_ms[stepIndex];
        dueMs = stepMs === undefined ? null : t + stepMs;
      }
    } else if (ev.result === 'incorrect') {
      streak = 0;
      dueMs = t + config.relearn_delay_ms;
    }
    // "partial" changes nothing.
  }

  const due_at = dueMs === null ? null : new Date(dueMs).toISOString();
  return { streak, last_usable_at: lastUsableAt, due_at };
}
