import type { ClientState, StoredEvent, ServerEvent } from '../kernel/index.js';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; state: ClientState }
  | { status: 'corrupt'; raw: string };

export interface ClientStore {
  load(): Promise<LoadResult>;
  save(state: ClientState): Promise<void>;
}

export function serializeState(state: ClientState): string {
  return JSON.stringify(state);
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidStoredEvent(item: unknown): item is StoredEvent {
  if (!isObject(item)) return false;
  if (typeof item.device_id !== 'string') return false;
  if (typeof item.device_seq !== 'number' || !Number.isInteger(item.device_seq)) return false;
  if (!isObject(item.event)) return false;
  if (typeof item.event.event_id !== 'string') return false;
  if (item.server_seq !== undefined && (typeof item.server_seq !== 'number' || !Number.isInteger(item.server_seq))) {
    return false;
  }
  if (item.received_at !== undefined && typeof item.received_at !== 'string') {
    return false;
  }
  return true;
}

function isValidServerEvent(item: unknown): item is ServerEvent {
  if (!isObject(item)) return false;
  if (typeof item.device_id !== 'string') return false;
  if (typeof item.device_seq !== 'number' || !Number.isInteger(item.device_seq)) return false;
  if (typeof item.server_seq !== 'number' || !Number.isInteger(item.server_seq)) return false;
  if (typeof item.received_at !== 'string') return false;
  if (!('raw' in item)) return false;
  return true;
}

export function parseState(raw: string): LoadResult {
  if (typeof raw !== 'string') {
    return { status: 'corrupt', raw: String(raw) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw };
  }

  if (!isObject(parsed)) {
    return { status: 'corrupt', raw };
  }

  if (typeof parsed.device_id !== 'string') {
    return { status: 'corrupt', raw };
  }
  if (typeof parsed.next_device_seq !== 'number' || !Number.isInteger(parsed.next_device_seq) || parsed.next_device_seq < 1) {
    return { status: 'corrupt', raw };
  }
  if (typeof parsed.cursor !== 'number' || !Number.isInteger(parsed.cursor) || parsed.cursor < 0) {
    return { status: 'corrupt', raw };
  }

  if (!Array.isArray(parsed.events) || !parsed.events.every(isValidStoredEvent)) {
    return { status: 'corrupt', raw };
  }

  if (!Array.isArray(parsed.outbox) || !parsed.outbox.every(id => typeof id === 'string')) {
    return { status: 'corrupt', raw };
  }

  if (
    !Array.isArray(parsed.rejected) ||
    !parsed.rejected.every(
      r => isObject(r) && typeof r.event_id === 'string' && typeof r.reason === 'string'
    )
  ) {
    return { status: 'corrupt', raw };
  }

  if (!Array.isArray(parsed.opaque) || !parsed.opaque.every(isValidServerEvent)) {
    return { status: 'corrupt', raw };
  }

  if (
    !Array.isArray(parsed.quarantined) ||
    !parsed.quarantined.every(q => isObject(q) && typeof q.reason === 'string' && 'raw' in q)
  ) {
    return { status: 'corrupt', raw };
  }

  if (
    !Array.isArray(parsed.conflicts) ||
    !parsed.conflicts.every(
      c =>
        isObject(c) &&
        typeof c.event_id === 'string' &&
        typeof c.reason === 'string' &&
        'preserved_copy' in c
    )
  ) {
    return { status: 'corrupt', raw };
  }

  return {
    status: 'ok',
    state: parsed as unknown as ClientState,
  };
}

export class InMemoryClientStore implements ClientStore {
  private data: string | null = null;

  async load(): Promise<LoadResult> {
    if (this.data === null) {
      return { status: 'empty' };
    }
    return parseState(this.data);
  }

  async save(state: ClientState): Promise<void> {
    this.data = serializeState(state);
  }
}
