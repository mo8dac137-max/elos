import type { ClientState, StoredEvent } from '../kernel/index.js';

export interface BackupManifest {
  format: 'elos-backup-1';
  created_at: string;
  device_id: string;
  cursor: number;
  event_count: number;
  events_sha256: string;
}

export interface BackupFile extends BackupManifest {
  events: StoredEvent[];
}

export type Sha256Fn = (input: string) => Promise<string>;

export function eventsToJsonl(events: StoredEvent[]): string {
  if (events.length === 0) {
    return '';
  }
  return events
    .map((e) => {
      const lineObj: Record<string, unknown> = {
        event: e.event,
        device_id: e.device_id,
        device_seq: e.device_seq,
      };
      if (e.server_seq !== undefined) {
        lineObj.server_seq = e.server_seq;
      }
      if (e.received_at !== undefined) {
        lineObj.received_at = e.received_at;
      }
      return JSON.stringify(lineObj);
    })
    .join('\n');
}

export async function buildBackup(
  state: ClientState,
  createdAtIso: string,
  sha256: Sha256Fn
): Promise<BackupFile> {
  const events: StoredEvent[] = JSON.parse(JSON.stringify(state.events));
  const jsonl = eventsToJsonl(events);
  const events_sha256 = await sha256(jsonl);

  return {
    format: 'elos-backup-1',
    created_at: createdAtIso,
    device_id: state.device_id,
    cursor: state.cursor,
    event_count: events.length,
    events_sha256,
    events,
  };
}

export type ParseBackupResult =
  | { kind: 'ok'; backup: BackupFile }
  | { kind: 'invalid'; reason: string };

export async function parseBackup(
  raw: string,
  sha256: Sha256Fn
): Promise<ParseBackupResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'invalid', reason: 'not an ELOS backup' };
  }

  const data = parsed as Record<string, unknown>;
  if (data.format !== 'elos-backup-1') {
    return { kind: 'invalid', reason: 'not an ELOS backup' };
  }

  if (
    typeof data.created_at !== 'string' ||
    typeof data.device_id !== 'string' ||
    data.device_id.trim() === '' ||
    typeof data.cursor !== 'number' ||
    !Number.isInteger(data.cursor) ||
    data.cursor < 0 ||
    typeof data.event_count !== 'number' ||
    !Number.isInteger(data.event_count) ||
    data.event_count < 0
  ) {
    return { kind: 'invalid', reason: 'bad manifest' };
  }

  if (!Array.isArray(data.events) || data.events.length !== data.event_count) {
    return { kind: 'invalid', reason: 'event_count mismatch' };
  }

  for (let i = 0; i < data.events.length; i++) {
    const item = data.events[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
    const evObj = item as Record<string, unknown>;
    if (
      !evObj.event ||
      typeof evObj.event !== 'object' ||
      Array.isArray(evObj.event) ||
      typeof (evObj.event as Record<string, unknown>).event_id !== 'string'
    ) {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
    if (typeof evObj.device_id !== 'string') {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
    if (
      typeof evObj.device_seq !== 'number' ||
      !Number.isInteger(evObj.device_seq)
    ) {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
    if (
      evObj.server_seq !== undefined &&
      (typeof evObj.server_seq !== 'number' ||
        !Number.isInteger(evObj.server_seq))
    ) {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
    if (
      evObj.received_at !== undefined &&
      typeof evObj.received_at !== 'string'
    ) {
      return { kind: 'invalid', reason: 'bad event at index ' + i };
    }
  }

  const events = data.events as StoredEvent[];
  if (typeof data.events_sha256 !== 'string') {
    return { kind: 'invalid', reason: 'checksum mismatch' };
  }

  const computedChecksum = await sha256(eventsToJsonl(events));
  if (data.events_sha256 !== computedChecksum) {
    return { kind: 'invalid', reason: 'checksum mismatch' };
  }

  return {
    kind: 'ok',
    backup: {
      format: 'elos-backup-1',
      created_at: data.created_at,
      device_id: data.device_id,
      cursor: data.cursor,
      event_count: data.event_count,
      events_sha256: data.events_sha256,
      events,
    },
  };
}

export function mergeBackup(
  state: ClientState,
  backup: BackupFile
): { state: ClientState; added: number; merged: number } {
  const existingIds = new Set(state.events.map((s) => s.event.event_id));
  const addedEvents: StoredEvent[] = [];
  let mergedCount = 0;

  for (const bEvent of backup.events) {
    if (!existingIds.has(bEvent.event.event_id)) {
      addedEvents.push(JSON.parse(JSON.stringify(bEvent)));
      existingIds.add(bEvent.event.event_id);
    } else {
      mergedCount++;
    }
  }

  const newEvents = [
    ...state.events.map((e) => JSON.parse(JSON.stringify(e))),
    ...addedEvents,
  ];

  const addedUnsyncedIds = addedEvents
    .filter((e) => e.server_seq === undefined)
    .map((e) => e.event.event_id);
  const newOutbox = [...state.outbox, ...addedUnsyncedIds];

  const addedSameDeviceEvents = addedEvents.filter(
    (e) => e.device_id === state.device_id
  );
  let newNextDeviceSeq = state.next_device_seq;
  if (addedSameDeviceEvents.length > 0) {
    const maxDeviceSeq = Math.max(
      ...addedSameDeviceEvents.map((e) => e.device_seq)
    );
    newNextDeviceSeq = Math.max(state.next_device_seq, maxDeviceSeq + 1);
  }

  const newCursor = Math.max(state.cursor, backup.cursor);

  const newState: ClientState = {
    device_id: state.device_id,
    next_device_seq: newNextDeviceSeq,
    events: newEvents,
    outbox: newOutbox,
    rejected: [...state.rejected.map((r) => ({ ...r }))],
    cursor: newCursor,
    opaque: [...state.opaque.map((o) => ({ ...o }))],
    quarantined: [...state.quarantined.map((q) => ({ ...q }))],
    conflicts: [...state.conflicts.map((c) => ({ ...c }))],
  };

  return {
    state: newState,
    added: addedEvents.length,
    merged: mergedCount,
  };
}
