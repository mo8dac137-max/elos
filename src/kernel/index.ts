export type Result = 'correct' | 'partial' | 'incorrect' | 'not_assessable';
export type Reliability = 'usable' | 'low' | 'unusable';
export type EvaluatorType = 'deterministic' | 'llm' | 'human' | 'owner';
export type Modality =
  | 'receptive_written'
  | 'receptive_spoken'
  | 'productive_written'
  | 'productive_spoken';

export type TaskClass =
  | 'recognition_item'
  | 'controlled_recall'
  | 'guided_production'
  | 'independent_production';

export type State =
  | 'unknown'
  | 'exposure'
  | 'recognition'
  | 'controlled'
  | 'guided'
  | 'spontaneous'
  | 'mastery';

export interface Evaluator {
  type: EvaluatorType;
  id: string;
  version: string;
}

export interface EvidenceEvent {
  event_id: string;
  payload_type: string;
  payload_version: number;
  occurred_at: string;
  recorded_at: string;
  unit_refs: string[];
  skill: string;
  modality: Modality;
  task_class: TaskClass;
  context_id: string;
  evaluator: Evaluator;
  reliability: Reliability;
  result: Result;
  corrects_event_id?: string;
  payload: unknown;
}

export interface ItemResponsePayload {
  item_id: string;
  response: string;
}

export interface SelfReportPayload {
  claim: 'know' | 'dont_know';
}

export interface DeriveUnitStateConfig {
  minDelayMs: number;
}

export interface DerivedUnitState {
  unitId: string;
  state: State;
  confidence: 'normal' | 'weakened';
  recheckRecommended: boolean;
  selfReportedUnknown: boolean;
  usableEventCount: number;
  conflicts: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export interface TaskClassInfo {
  establishes: State;
  independent: boolean;
}

export const STATE_LADDER: readonly State[] = [
  'unknown',
  'exposure',
  'recognition',
  'controlled',
  'guided',
  'spontaneous',
  'mastery',
] as const;

export const STATE_RANK: Record<State, number> = {
  unknown: 0,
  exposure: 1,
  recognition: 2,
  controlled: 3,
  guided: 4,
  spontaneous: 5,
  mastery: 6,
};

export const TASK_CLASS_TABLE: Record<TaskClass, TaskClassInfo> = {
  recognition_item: { establishes: 'recognition', independent: false },
  controlled_recall: { establishes: 'controlled', independent: false },
  guided_production: { establishes: 'guided', independent: false },
  independent_production: { establishes: 'spontaneous', independent: true },
};

const VALID_MODALITIES: readonly Modality[] = [
  'receptive_written',
  'receptive_spoken',
  'productive_written',
  'productive_spoken',
];

const VALID_EVALUATOR_TYPES: readonly EvaluatorType[] = [
  'deterministic',
  'llm',
  'human',
  'owner',
];

const VALID_RELIABILITIES: readonly Reliability[] = ['usable', 'low', 'unusable'];

const VALID_RESULTS: readonly Result[] = [
  'correct',
  'partial',
  'incorrect',
  'not_assessable',
];

const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function taskCanEstablish(taskClass: TaskClass, targetState: State): boolean {
  const info = TASK_CLASS_TABLE[taskClass];
  if (!info) return false;
  return STATE_RANK[info.establishes] >= STATE_RANK[targetState];
}

export function getNextState(state: State): State | null {
  const rank = STATE_RANK[state];
  if (rank < STATE_LADDER.length - 1) {
    return STATE_LADDER[rank + 1];
  }
  return null;
}

function validateEnvelope(raw: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['Event must be a non-null object'] };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.event_id !== 'string' || obj.event_id.trim() === '') {
    errors.push('event_id must be a non-empty string');
  }

  if (typeof obj.payload_type !== 'string' || obj.payload_type.trim() === '') {
    errors.push('payload_type must be a non-empty string');
  }

  if (
    typeof obj.payload_version !== 'number' ||
    !Number.isInteger(obj.payload_version) ||
    obj.payload_version < 1
  ) {
    errors.push('payload_version must be a positive integer');
  }

  if (
    typeof obj.occurred_at !== 'string' ||
    !ISO_8601_UTC_REGEX.test(obj.occurred_at) ||
    Number.isNaN(Date.parse(obj.occurred_at))
  ) {
    errors.push('occurred_at must be an ISO-8601 UTC timestamp');
  }

  if (
    typeof obj.recorded_at !== 'string' ||
    !ISO_8601_UTC_REGEX.test(obj.recorded_at) ||
    Number.isNaN(Date.parse(obj.recorded_at))
  ) {
    errors.push('recorded_at must be an ISO-8601 UTC timestamp');
  }

  if (
    !Array.isArray(obj.unit_refs) ||
    obj.unit_refs.length === 0 ||
    !obj.unit_refs.every(u => typeof u === 'string' && u.trim() !== '')
  ) {
    errors.push('unit_refs must be a non-empty array of non-empty strings');
  }

  if (typeof obj.skill !== 'string' || obj.skill.trim() === '') {
    errors.push('skill must be a non-empty string');
  }

  if (!VALID_MODALITIES.includes(obj.modality as Modality)) {
    errors.push('modality must be one of the known modalities');
  }

  if (!Object.prototype.hasOwnProperty.call(TASK_CLASS_TABLE, obj.task_class as string)) {
    errors.push('task_class must be one of the known task classes');
  }

  if (typeof obj.context_id !== 'string' || obj.context_id.trim() === '') {
    errors.push('context_id must be a non-empty string');
  }

  if (
    typeof obj.evaluator !== 'object' ||
    obj.evaluator === null ||
    Array.isArray(obj.evaluator)
  ) {
    errors.push('evaluator must be a non-null object');
  } else {
    const ev = obj.evaluator as Record<string, unknown>;
    if (!VALID_EVALUATOR_TYPES.includes(ev.type as EvaluatorType)) {
      errors.push('evaluator.type must be deterministic, llm, human, or owner');
    }
    if (typeof ev.id !== 'string' || ev.id.trim() === '') {
      errors.push('evaluator.id must be a non-empty string');
    }
    if (typeof ev.version !== 'string' || ev.version.trim() === '') {
      errors.push('evaluator.version must be a non-empty string');
    }
  }

  if (!VALID_RELIABILITIES.includes(obj.reliability as Reliability)) {
    errors.push('reliability must be usable, low, or unusable');
  }

  if (!VALID_RESULTS.includes(obj.result as Result)) {
    errors.push('result must be correct, partial, incorrect, or not_assessable');
  }

  if (
    obj.corrects_event_id !== undefined &&
    (typeof obj.corrects_event_id !== 'string' || obj.corrects_event_id.trim() === '')
  ) {
    errors.push('corrects_event_id must be a non-empty string if provided');
  }

  if (
    typeof obj.corrects_event_id === 'string' &&
    typeof obj.event_id === 'string' &&
    obj.corrects_event_id === obj.event_id
  ) {
    errors.push('corrects_event_id cannot equal event_id');
  }

  if (obj.reliability === 'unusable' && obj.result !== 'not_assessable') {
    errors.push('reliability "unusable" requires result "not_assessable"');
  }

  if (obj.payload_type === 'self_report') {
    const evType =
      typeof obj.evaluator === 'object' && obj.evaluator !== null
        ? (obj.evaluator as Record<string, unknown>).type
        : undefined;
    if (evType !== 'owner') {
      errors.push('self_report requires evaluator.type "owner"');
    }
  }

  return { ok: errors.length === 0, errors };
}

function validatePayload(
  payloadType: string,
  payloadVersion: number,
  payload: unknown
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (payloadType === 'item_response' && payloadVersion === 1) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      errors.push('payload for (item_response, 1) must be an object');
    } else {
      const p = payload as Record<string, unknown>;
      if (typeof p.item_id !== 'string' || p.item_id.trim() === '') {
        errors.push('payload.item_id must be a non-empty string');
      }
      if (typeof p.response !== 'string') {
        errors.push('payload.response must be a string');
      }
    }
    return { ok: errors.length === 0, errors };
  }

  if (payloadType === 'self_report' && payloadVersion === 1) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      errors.push('payload for (self_report, 1) must be an object');
    } else {
      const p = payload as Record<string, unknown>;
      if (p.claim !== 'know' && p.claim !== 'dont_know') {
        errors.push('payload.claim must be "know" or "dont_know"');
      }
    }
    return { ok: errors.length === 0, errors };
  }

  return {
    ok: false,
    errors: [`Unknown payload type "${payloadType}" or version ${payloadVersion}`],
  };
}

export function validateEvent(event: unknown): ValidationResult {
  const envCheck = validateEnvelope(event);
  if (!envCheck.ok) {
    return { ok: false, errors: envCheck.errors };
  }

  const obj = event as EvidenceEvent;
  const payloadCheck = validatePayload(obj.payload_type, obj.payload_version, obj.payload);
  if (!payloadCheck.ok) {
    return { ok: false, errors: payloadCheck.errors };
  }

  return { ok: true };
}

export function classifyIncoming(raw: unknown): 'valid' | 'opaque' | 'invalid' {
  const envCheck = validateEnvelope(raw);
  if (!envCheck.ok) {
    return 'invalid';
  }

  const obj = raw as Record<string, unknown>;
  const pType = obj.payload_type as string;
  const pVersion = obj.payload_version as number;

  const isKnownType =
    (pType === 'item_response' && pVersion === 1) ||
    (pType === 'self_report' && pVersion === 1);

  if (!isKnownType) {
    return 'opaque';
  }

  const payloadCheck = validatePayload(pType, pVersion, obj.payload);
  if (!payloadCheck.ok) {
    return 'invalid';
  }

  return 'valid';
}

export function compareEvents(a: EvidenceEvent, b: EvidenceEvent): number {
  const timeA = Date.parse(a.occurred_at);
  const timeB = Date.parse(b.occurred_at);
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  if (a.event_id < b.event_id) return -1;
  if (a.event_id > b.event_id) return 1;
  return 0;
}

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

export function deriveUnitState(
  unitId: string,
  events: readonly EvidenceEvent[],
  config: DeriveUnitStateConfig
): DerivedUnitState {
  const validForUnit = events.filter(
    e => Array.isArray(e.unit_refs) && e.unit_refs.includes(unitId) && classifyIncoming(e) === 'valid'
  );

  const groups = new Map<string, EvidenceEvent[]>();
  for (const ev of validForUnit) {
    const list = groups.get(ev.event_id) || [];
    list.push(ev);
    groups.set(ev.event_id, list);
  }

  const conflictsSet = new Set<string>();
  const deduped: EvidenceEvent[] = [];

  for (const [eventId, group] of groups.entries()) {
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
        conflictsSet.add(eventId);
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

  let state: State = 'unknown';
  let confidence: 'normal' | 'weakened' = 'normal';
  let recheckRecommended = false;
  let selfReportedUnknown = false;
  let usableEventCount = 0;

  const usableAssessmentEvents: EvidenceEvent[] = [];

  for (const ev of eventsToReplay) {
    if (ev.payload_type === 'self_report') {
      const p = ev.payload as SelfReportPayload | undefined;
      if (p?.claim === 'dont_know') {
        selfReportedUnknown = true;
      }
    }

    const isUsable = ev.reliability === 'usable' && ev.result !== 'not_assessable';
    if (!isUsable) {
      continue;
    }

    usableEventCount++;

    if (ev.payload_type === 'self_report') {
      continue;
    }

    usableAssessmentEvents.push(ev);

    if (state === 'unknown') {
      state = 'exposure';
    } else if (state === 'spontaneous') {
      const isCurrentInQ =
        ev.result === 'correct' &&
        ev.task_class === 'independent_production' &&
        ev.evaluator.type !== 'llm' &&
        ev.evaluator.type !== 'owner';

      if (isCurrentInQ) {
        const qEventsWithDelay: { ev: EvidenceEvent; delayOk: boolean }[] = [];
        for (let i = 0; i < usableAssessmentEvents.length; i++) {
          const uEv = usableAssessmentEvents[i];
          if (
            uEv.result === 'correct' &&
            uEv.task_class === 'independent_production' &&
            uEv.evaluator.type !== 'llm' &&
            uEv.evaluator.type !== 'owner'
          ) {
            let delayOk = false;
            if (i > 0) {
              const prev = usableAssessmentEvents[i - 1];
              const diff = Date.parse(uEv.occurred_at) - Date.parse(prev.occurred_at);
              if (diff >= config.minDelayMs) {
                delayOk = true;
              }
            }
            qEventsWithDelay.push({ ev: uEv, delayOk });
          }
        }

        const hasDelay = qEventsWithDelay.some(q => q.delayOk);
        const distinctContexts =
          new Set(qEventsWithDelay.map(q => q.ev.context_id)).size >= 2;

        if (hasDelay && distinctContexts) {
          state = 'mastery';
        }
      }
    } else if (state !== 'mastery') {
      if (ev.result === 'correct') {
        const next = getNextState(state);
        if (next && taskCanEstablish(ev.task_class, next)) {
          state = next;
        }
      }
    }
  }

  if (usableAssessmentEvents.length > 0) {
    const mostRecentUsable = usableAssessmentEvents[usableAssessmentEvents.length - 1];
    if (mostRecentUsable.result === 'incorrect') {
      const established = TASK_CLASS_TABLE[mostRecentUsable.task_class]?.establishes;
      if (established && STATE_RANK[state] >= STATE_RANK[established]) {
        confidence = 'weakened';
        recheckRecommended = true;
      } else {
        confidence = 'normal';
        recheckRecommended = false;
      }
    } else {
      confidence = 'normal';
      recheckRecommended = false;
    }
  } else {
    confidence = 'normal';
    recheckRecommended = false;
  }

  const conflicts = Array.from(conflictsSet).sort();

  return {
    unitId,
    state,
    confidence,
    recheckRecommended,
    selfReportedUnknown,
    usableEventCount,
    conflicts,
  };
}

export * from './admissibility.js';
export * from './sync.js';
