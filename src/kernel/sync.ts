import { validateEvent, classifyIncoming, deriveUnitState } from './index.js';
import type { EvidenceEvent, DeriveUnitStateConfig, DerivedUnitState } from './index.js';

export interface StoredEvent {
  event: EvidenceEvent;
  device_id: string;
  device_seq: number;
  server_seq?: number;
  received_at?: string;
}

export interface ServerEvent {
  raw: unknown;
  device_id: string;
  device_seq: number;
  server_seq: number;
  received_at: string;
}

export interface ClientState {
  device_id: string;
  next_device_seq: number;
  events: StoredEvent[];
  outbox: string[];
  rejected: { event_id: string; reason: string }[];
  cursor: number;
  opaque: ServerEvent[];
  quarantined: { raw: unknown; reason: string }[];
  conflicts: { event_id: string; preserved_copy: unknown; reason: string }[];
}

export interface PushResponse {
  accepted: { event_id: string; server_seq: number; received_at: string }[];
  rejected: { event_id: string; reason: string }[];
  retryable: string[];
}

export interface PullPage {
  events: ServerEvent[];
  next_cursor: number;
}

function canonicalSerialize(val: unknown): string {
  if (val === undefined) {
    return 'undefined';
  }
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

function hasValidSyncMetadata(
  item: unknown
): item is { device_id: string; device_seq: number; server_seq: number; received_at: string; raw: unknown } {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return false;
  }
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.device_id === 'string' &&
    typeof rec.device_seq === 'number' &&
    Number.isInteger(rec.device_seq) &&
    typeof rec.server_seq === 'number' &&
    Number.isInteger(rec.server_seq) &&
    typeof rec.received_at === 'string' &&
    'raw' in rec
  );
}

function addQuarantined(
  quarantinedList: { raw: unknown; reason: string }[],
  raw: unknown,
  reason: string
): void {
  const rawCanonical = canonicalSerialize(raw);
  const exists = quarantinedList.some(
    q => q.reason === reason && canonicalSerialize(q.raw) === rawCanonical
  );
  if (!exists) {
    quarantinedList.push({ raw, reason });
  }
}

function cloneEvent(ev: EvidenceEvent): EvidenceEvent {
  return JSON.parse(JSON.stringify(ev));
}

export function createClient(device_id: string): ClientState {
  return {
    device_id,
    next_device_seq: 1,
    events: [],
    outbox: [],
    rejected: [],
    cursor: 0,
    opaque: [],
    quarantined: [],
    conflicts: [],
  };
}

export function recordLocalEvent(
  state: ClientState,
  event: EvidenceEvent
): { state: ClientState; outcome: 'recorded' | 'duplicate' | 'rejected'; errors?: string[] } {
  const val = validateEvent(event);
  if (!val.ok) {
    return {
      state,
      outcome: 'rejected',
      errors: val.errors || [],
    };
  }

  const existing = state.events.find(e => e.event.event_id === event.event_id);
  if (existing) {
    if (canonicalSerialize(existing.event) === canonicalSerialize(event)) {
      return {
        state,
        outcome: 'duplicate',
      };
    } else {
      return {
        state,
        outcome: 'rejected',
        errors: ['event_id_conflict'],
      };
    }
  }

  const stored: StoredEvent = {
    event: cloneEvent(event),
    device_id: state.device_id,
    device_seq: state.next_device_seq,
  };

  const nextState: ClientState = {
    device_id: state.device_id,
    next_device_seq: state.next_device_seq + 1,
    events: [...state.events.map(e => ({ ...e, event: cloneEvent(e.event) })), stored],
    outbox: [...state.outbox, event.event_id],
    rejected: [...state.rejected.map(r => ({ ...r }))],
    cursor: state.cursor,
    opaque: [...state.opaque.map(o => ({ ...o }))],
    quarantined: [...state.quarantined.map(q => ({ ...q }))],
    conflicts: [...state.conflicts.map(c => ({ ...c }))],
  };

  return {
    state: nextState,
    outcome: 'recorded',
  };
}

export function prepareBatch(state: ClientState, maxSize: number): StoredEvent[] {
  const inOutbox = state.events.filter(e => state.outbox.includes(e.event.event_id));
  const sorted = inOutbox.sort((a, b) => a.device_seq - b.device_seq);
  return sorted.slice(0, maxSize).map(e => ({
    ...e,
    event: cloneEvent(e.event),
  }));
}

export function applyPushResponse(state: ClientState, response: PushResponse): ClientState {
  if (typeof response !== 'object' || response === null) {
    return state;
  }

  const nextEvents: StoredEvent[] = state.events.map(e => ({
    ...e,
    event: cloneEvent(e.event),
  }));
  let nextOutbox: string[] = [...state.outbox];
  const nextRejected = [...state.rejected.map(r => ({ ...r }))];

  if (Array.isArray(response.accepted)) {
    for (const acc of response.accepted) {
      if (typeof acc !== 'object' || acc === null || typeof acc.event_id !== 'string') {
        continue;
      }
      const local = nextEvents.find(e => e.event.event_id === acc.event_id);
      if (!local) {
        continue;
      }
      const isValidAccepted =
        typeof acc.server_seq === 'number' &&
        Number.isInteger(acc.server_seq) &&
        acc.server_seq > 0 &&
        typeof acc.received_at === 'string' &&
        acc.received_at.length > 0;

      if (!isValidAccepted) {
        continue;
      }

      if (local.server_seq === undefined) {
        local.server_seq = acc.server_seq;
      }
      if (local.received_at === undefined) {
        local.received_at = acc.received_at;
      }
      nextOutbox = nextOutbox.filter(id => id !== acc.event_id);
    }
  }

  if (Array.isArray(response.rejected)) {
    for (const rej of response.rejected) {
      if (typeof rej !== 'object' || rej === null || typeof rej.event_id !== 'string') {
        continue;
      }
      const local = nextEvents.find(e => e.event.event_id === rej.event_id);
      if (!local) {
        continue;
      }
      if (typeof rej.reason !== 'string') {
        continue;
      }
      nextOutbox = nextOutbox.filter(id => id !== rej.event_id);
      if (!nextRejected.some(r => r.event_id === rej.event_id)) {
        nextRejected.push({ event_id: rej.event_id, reason: rej.reason });
      }
    }
  }

  return {
    device_id: state.device_id,
    next_device_seq: state.next_device_seq,
    events: nextEvents,
    outbox: nextOutbox,
    rejected: nextRejected,
    cursor: state.cursor,
    opaque: [...state.opaque.map(o => ({ ...o }))],
    quarantined: [...state.quarantined.map(q => ({ ...q }))],
    conflicts: [...state.conflicts.map(c => ({ ...c }))],
  };
}

export function applyPull(state: ClientState, page: PullPage): ClientState {
  try {
    if (typeof page !== 'object' || page === null) {
      return state;
    }

    if (!Array.isArray(page.events)) {
      return state;
    }

    const validMetaItems = page.events.filter(hasValidSyncMetadata);
    if (validMetaItems.length > 0) {
      let M = -Infinity;
      for (const item of validMetaItems) {
        if (item.server_seq > M) {
          M = item.server_seq;
        }
      }
      const expectedCursor = Math.max(state.cursor, M);
      if (page.next_cursor !== expectedCursor) {
        return state;
      }
    } else {
      if (page.next_cursor !== state.cursor) {
        return state;
      }
    }

    const nextEvents: StoredEvent[] = state.events.map(e => ({
      ...e,
      event: cloneEvent(e.event),
    }));
    let nextOutbox: string[] = [...state.outbox];
    const nextOpaque: ServerEvent[] = [...state.opaque.map(o => ({ ...o }))];
    const nextQuarantined = [...state.quarantined.map(q => ({ ...q }))];
    const nextConflicts = [...state.conflicts.map(c => ({ ...c }))];

    const sortedItems = [...page.events].sort((a, b) => {
      const seqA = a && typeof a === 'object' && typeof (a as any).server_seq === 'number' ? (a as any).server_seq : 0;
      const seqB = b && typeof b === 'object' && typeof (b as any).server_seq === 'number' ? (b as any).server_seq : 0;
      return seqA - seqB;
    });

    for (const item of sortedItems) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        addQuarantined(nextQuarantined, item, 'malformed_item');
        continue;
      }

      const rec = item as unknown as Record<string, unknown>;
      if (!hasValidSyncMetadata(item)) {
        addQuarantined(
          nextQuarantined,
          'raw' in rec ? rec.raw : item,
          'malformed_sync_metadata'
        );
        continue;
      }

      const serverEvt = item as ServerEvent;
      if (serverEvt.server_seq <= state.cursor) {
        continue;
      }

      const classification = classifyIncoming(serverEvt.raw);
      if (classification === 'invalid') {
        addQuarantined(nextQuarantined, serverEvt.raw, 'invalid_event');
      } else if (classification === 'opaque') {
        if (!nextOpaque.some(o => o.server_seq === serverEvt.server_seq)) {
          nextOpaque.push({ ...serverEvt });
        }
      } else if (classification === 'valid') {
        const validEvent = serverEvt.raw as EvidenceEvent;
        const localIndex = nextEvents.findIndex(e => e.event.event_id === validEvent.event_id);

        if (localIndex === -1) {
          nextEvents.push({
            event: cloneEvent(validEvent),
            device_id: serverEvt.device_id,
            device_seq: serverEvt.device_seq,
            server_seq: serverEvt.server_seq,
            received_at: serverEvt.received_at,
          });
        } else {
          const local = nextEvents[localIndex];
          if (canonicalSerialize(local.event) === canonicalSerialize(validEvent)) {
            if (local.server_seq === undefined) {
              local.server_seq = serverEvt.server_seq;
            }
            if (local.received_at === undefined) {
              local.received_at = serverEvt.received_at;
            }
            nextOutbox = nextOutbox.filter(id => id !== validEvent.event_id);
          } else {
            nextConflicts.push({
              event_id: validEvent.event_id,
              preserved_copy: cloneEvent(local.event),
              reason: 'server_copy_wins',
            });
            nextEvents[localIndex] = {
              event: cloneEvent(validEvent),
              device_id: serverEvt.device_id,
              device_seq: serverEvt.device_seq,
              server_seq: serverEvt.server_seq,
              received_at: serverEvt.received_at,
            };
            nextOutbox = nextOutbox.filter(id => id !== validEvent.event_id);
          }
        }
      }
    }

    return {
      device_id: state.device_id,
      next_device_seq: state.next_device_seq,
      events: nextEvents,
      outbox: nextOutbox,
      rejected: [...state.rejected.map(r => ({ ...r }))],
      cursor: page.next_cursor,
      opaque: nextOpaque,
      quarantined: nextQuarantined,
      conflicts: nextConflicts,
    };
  } catch {
    return state;
  }
}

export function unsyncedCount(state: ClientState): number {
  return state.outbox.length;
}

export function activeEvents(state: ClientState): EvidenceEvent[] {
  const sorted = [...state.events].sort((a, b) => {
    if (a.device_id < b.device_id) return -1;
    if (a.device_id > b.device_id) return 1;
    return a.device_seq - b.device_seq;
  });
  return sorted.map(s => cloneEvent(s.event));
}

export function deriveFromClient(
  state: ClientState,
  unitId: string,
  config: DeriveUnitStateConfig
): DerivedUnitState {
  return deriveUnitState(unitId, activeEvents(state), config);
}
