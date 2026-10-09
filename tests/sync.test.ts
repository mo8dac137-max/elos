import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  createClient,
  recordLocalEvent,
  prepareBatch,
  applyPushResponse,
  applyPull,
  unsyncedCount,
  activeEvents,
  deriveFromClient,
  ClientState,
  ServerEvent,
  PullPage,
  PushResponse,
  EvidenceEvent,
} from '../src/kernel/index.js';

function makeEvent(id: string, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    event_id: id,
    payload_type: 'item_response',
    payload_version: 1,
    occurred_at: '2026-01-01T10:00:00Z',
    recorded_at: '2026-01-01T10:00:01Z',
    unit_refs: ['unit-sync'],
    skill: 'vocabulary',
    modality: 'productive_written',
    task_class: 'recognition_item',
    context_id: 'ctx-1',
    evaluator: { type: 'deterministic', id: 'd1', version: '1.0' },
    reliability: 'usable',
    result: 'correct',
    payload: { item_id: 'item-1', response: 'cat' },
    ...overrides,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as any)) {
    deepFreeze((obj as any)[key]);
  }
  return obj;
}

describe('ELOS Sync Core - Milestone C', () => {
  it('device_seq is monotonic and unique; a duplicate record changes nothing; a conflicting event_id is rejected', () => {
    let client = createClient('dev-1');
    assert.strictEqual(client.next_device_seq, 1);
    assert.strictEqual(client.events.length, 0);

    const ev1 = makeEvent('ev-1');
    const r1 = recordLocalEvent(client, ev1);
    assert.strictEqual(r1.outcome, 'recorded');
    client = r1.state;
    assert.strictEqual(client.next_device_seq, 2);
    assert.strictEqual(client.events.length, 1);
    assert.strictEqual(client.events[0].device_seq, 1);

    const ev2 = makeEvent('ev-2');
    const r2 = recordLocalEvent(client, ev2);
    assert.strictEqual(r2.outcome, 'recorded');
    client = r2.state;
    assert.strictEqual(client.next_device_seq, 3);
    assert.strictEqual(client.events[1].device_seq, 2);

    // duplicate identical event
    const rDup = recordLocalEvent(client, ev1);
    assert.strictEqual(rDup.outcome, 'duplicate');
    assert.strictEqual(rDup.state, client);
    assert.strictEqual(client.events.length, 2);

    // conflicting event_id with different content
    const ev1Conflict = makeEvent('ev-1', { result: 'incorrect' });
    const rConflict = recordLocalEvent(client, ev1Conflict);
    assert.strictEqual(rConflict.outcome, 'rejected');
    assert.deepStrictEqual(rConflict.errors, ['event_id_conflict']);
    assert.strictEqual(rConflict.state, client);
  });

  it('push: accepted clears the outbox and sets server fields; the same response applied twice is idempotent; retryable stays; rejected is not retried and is listed once; a mixed partial-failure response', () => {
    let client = createClient('dev-1');
    const e1 = makeEvent('e1');
    const e2 = makeEvent('e2');
    const e3 = makeEvent('e3');
    client = recordLocalEvent(client, e1).state;
    client = recordLocalEvent(client, e2).state;
    client = recordLocalEvent(client, e3).state;

    assert.strictEqual(unsyncedCount(client), 3);
    const batch = prepareBatch(client, 2);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0].event.event_id, 'e1');
    assert.strictEqual(batch[1].event.event_id, 'e2');

    // Mixed partial-failure response: e1 accepted, e2 rejected, e3 retryable
    const pushResp: PushResponse = {
      accepted: [{ event_id: 'e1', server_seq: 101, received_at: '2026-01-01T10:05:00Z' }],
      rejected: [{ event_id: 'e2', reason: 'schema_violation' }],
      retryable: ['e3'],
    };

    const afterPush = applyPushResponse(client, pushResp);
    assert.strictEqual(afterPush.events[0].server_seq, 101);
    assert.strictEqual(afterPush.events[0].received_at, '2026-01-01T10:05:00Z');
    // outbox: e1 removed, e2 removed, e3 stays
    assert.deepStrictEqual(afterPush.outbox, ['e3']);
    assert.strictEqual(unsyncedCount(afterPush), 1);
    assert.strictEqual(afterPush.rejected.length, 1);
    assert.deepStrictEqual(afterPush.rejected[0], { event_id: 'e2', reason: 'schema_violation' });

    // Applying same response twice is idempotent
    const afterPush2 = applyPushResponse(afterPush, pushResp);
    assert.deepStrictEqual(afterPush2, afterPush);
    assert.strictEqual(afterPush2.rejected.length, 1);
  });

  it('lost acknowledgement: the event was pushed, no response was applied, a later pull returns it: the outbox is cleared, no duplicate exists, active events are unchanged', () => {
    let client = createClient('dev-1');
    const ev = makeEvent('ev-lost-ack');
    client = recordLocalEvent(client, ev).state;
    assert.strictEqual(client.outbox.includes('ev-lost-ack'), true);

    const pullPage: PullPage = {
      events: [
        {
          raw: ev,
          device_id: 'dev-1',
          device_seq: 1,
          server_seq: 50,
          received_at: '2026-01-01T10:02:00Z',
        },
      ],
      next_cursor: 50,
    };

    const afterPull = applyPull(client, pullPage);
    assert.strictEqual(afterPull.outbox.includes('ev-lost-ack'), false);
    assert.strictEqual(afterPull.events.length, 1);
    assert.strictEqual(afterPull.events[0].server_seq, 50);
    assert.strictEqual(afterPull.events[0].received_at, '2026-01-01T10:02:00Z');
    assert.deepStrictEqual(activeEvents(afterPull), [ev]);
  });

  it('cursor: it advances only through applyPull; replaying the same page changes nothing; a page with descending server_seq gives the same derived state as ascending; the cursor never decreases; a page with an invalid next_cursor leaves the state unchanged', () => {
    let client = createClient('dev-1');
    assert.strictEqual(client.cursor, 0);

    const evA = makeEvent('ev-a', { occurred_at: '2026-01-01T10:00:00Z' });
    const evB = makeEvent('ev-b', { occurred_at: '2026-01-01T10:05:00Z' });

    const serverItemA: ServerEvent = {
      raw: evA,
      device_id: 'dev-other',
      device_seq: 1,
      server_seq: 10,
      received_at: '2026-01-01T10:01:00Z',
    };
    const serverItemB: ServerEvent = {
      raw: evB,
      device_id: 'dev-other',
      device_seq: 2,
      server_seq: 20,
      received_at: '2026-01-01T10:06:00Z',
    };

    // Ascending page
    const pageAscending: PullPage = {
      events: [serverItemA, serverItemB],
      next_cursor: 20,
    };
    const pulledAsc = applyPull(client, pageAscending);
    assert.strictEqual(pulledAsc.cursor, 20);
    assert.strictEqual(pulledAsc.events.length, 2);

    // Replaying same page changes nothing
    const pulledAgain = applyPull(pulledAsc, pageAscending);
    assert.deepStrictEqual(pulledAgain, pulledAsc);

    // Descending page produces same derived state
    const pageDescending: PullPage = {
      events: [serverItemB, serverItemA],
      next_cursor: 20,
    };
    const pulledDesc = applyPull(client, pageDescending);
    const derivedAsc = deriveFromClient(pulledAsc, 'unit-sync', { minDelayMs: 60000 });
    const derivedDesc = deriveFromClient(pulledDesc, 'unit-sync', { minDelayMs: 60000 });
    assert.deepStrictEqual(derivedAsc, derivedDesc);

    // Invalid next_cursor (less than cursor, negative, float, non-finite)
    const badCursorPage: PullPage = {
      events: [],
      next_cursor: 10, // less than pulledAsc.cursor (25)
    };
    const unchanged1 = applyPull(pulledAsc, badCursorPage);
    assert.strictEqual(unchanged1, pulledAsc);

    const nanCursorPage = {
      events: [],
      next_cursor: NaN,
    } as any;
    const unchanged2 = applyPull(pulledAsc, nanCursorPage);
    assert.strictEqual(unchanged2, pulledAsc);
  });

  it('an unknown payload_type arrives: stored verbatim in opaque, absent from outbox and from derived state; invalid or garbage items (null, number, {}, missing metadata) are quarantined without throwing and without affecting the other items of the page', () => {
    let client = createClient('dev-1');

    const validEvt = makeEvent('ev-valid');
    const opaqueRaw = {
      ...makeEvent('ev-opaque'),
      payload_type: 'unknown_audio_format',
      payload_version: 1,
    };

    const validItem: ServerEvent = {
      raw: validEvt,
      device_id: 'dev-server',
      device_seq: 1,
      server_seq: 1,
      received_at: '2026-01-01T10:00:00Z',
    };

    const opaqueItem: ServerEvent = {
      raw: opaqueRaw,
      device_id: 'dev-server',
      device_seq: 2,
      server_seq: 2,
      received_at: '2026-01-01T10:01:00Z',
    };

    const invalidEvtItem: ServerEvent = {
      raw: { ...makeEvent('ev-invalid'), occurred_at: 'bad-timestamp' },
      device_id: 'dev-server',
      device_seq: 3,
      server_seq: 3,
      received_at: '2026-01-01T10:02:00Z',
    };

    const garbageNull = null as any;
    const garbageNumber = 42 as any;
    const garbageEmptyObj = {} as any;
    const missingMetadata = { raw: makeEvent('ev-missing-meta') } as any;

    const pullPage: PullPage = {
      events: [
        garbageNull,
        validItem,
        garbageNumber,
        opaqueItem,
        garbageEmptyObj,
        invalidEvtItem,
        missingMetadata,
      ],
      next_cursor: 3,
    };

    const stateAfter = applyPull(client, pullPage);

    // Valid item processed
    assert.strictEqual(stateAfter.events.length, 1);
    assert.strictEqual(stateAfter.events[0].event.event_id, 'ev-valid');

    // Opaque item stored verbatim in opaque, absent from outbox and derived state
    assert.strictEqual(stateAfter.opaque.length, 1);
    assert.strictEqual(stateAfter.opaque[0].server_seq, 2);
    assert.strictEqual(stateAfter.outbox.includes('ev-opaque'), false);

    const derived = deriveFromClient(stateAfter, 'unit-sync', { minDelayMs: 60000 });
    assert.strictEqual(derived.usableEventCount, 1);
    assert.strictEqual(derived.state, 'exposure');

    // Quarantined items recorded
    assert.ok(stateAfter.quarantined.some(q => q.reason === 'malformed_item'));
    assert.ok(stateAfter.quarantined.some(q => q.reason === 'malformed_sync_metadata'));
    assert.ok(stateAfter.quarantined.some(q => q.reason === 'invalid_event'));
  });

  it('conflict: server copy wins, the local copy appears in conflicts, derived state uses the server copy', () => {
    let client = createClient('dev-1');
    const localEvent = makeEvent('ev-conflict-1', {
      result: 'correct',
      task_class: 'recognition_item',
    });
    client = recordLocalEvent(client, localEvent).state;
    assert.strictEqual(client.events[0].event.result, 'correct');

    const serverEventData = makeEvent('ev-conflict-1', {
      result: 'incorrect',
      task_class: 'recognition_item',
    });

    const pullPage: PullPage = {
      events: [
        {
          raw: serverEventData,
          device_id: 'dev-server',
          device_seq: 1,
          server_seq: 100,
          received_at: '2026-01-01T12:00:00Z',
        },
      ],
      next_cursor: 100,
    };

    const afterPull = applyPull(client, pullPage);

    // Active event is server copy
    assert.strictEqual(afterPull.events.length, 1);
    assert.strictEqual(afterPull.events[0].event.result, 'incorrect');
    assert.strictEqual(afterPull.outbox.includes('ev-conflict-1'), false);

    // Local copy preserved in conflicts
    assert.strictEqual(afterPull.conflicts.length, 1);
    assert.strictEqual(afterPull.conflicts[0].event_id, 'ev-conflict-1');
    assert.strictEqual(afterPull.conflicts[0].reason, 'server_copy_wins');
    assert.strictEqual((afterPull.conflicts[0].preserved_copy as EvidenceEvent).result, 'correct');

    // Derived state reflects server copy (incorrect event)
    const derived = deriveFromClient(afterPull, 'unit-sync', { minDelayMs: 60000 });
    assert.strictEqual(derived.usableEventCount, 1);
    assert.strictEqual(derived.state, 'exposure');
  });

  it('convergence: two clients that receive the same events in different orders and different page splits have deep-equal deriveFromClient results (use at least 6 events and several permutations)', () => {
    const rawEvents: EvidenceEvent[] = [
      makeEvent('conv-1', { occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeEvent('conv-2', { occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeEvent('conv-3', { occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' }),
      makeEvent('conv-4', { occurred_at: '2026-01-01T10:15:00Z', task_class: 'guided_production', result: 'correct' }),
      makeEvent('conv-5', { occurred_at: '2026-01-01T10:20:00Z', task_class: 'independent_production', result: 'correct' }),
      makeEvent('conv-6', { occurred_at: '2026-01-01T10:25:00Z', task_class: 'controlled_recall', result: 'incorrect' }),
    ];

    const serverEvents: ServerEvent[] = rawEvents.map((ev, idx) => ({
      raw: ev,
      device_id: `dev-${idx % 2}`,
      device_seq: idx + 1,
      server_seq: idx + 1,
      received_at: `2026-01-01T10:${String(idx).padStart(2, '0')}:00Z`,
    }));

    // Client 1: pulls all 6 in order in a single page
    let c1 = createClient('client-1');
    c1 = applyPull(c1, { events: [...serverEvents], next_cursor: 6 });

    // Client 2: pulls in multiple split pages in scrambled order per page
    let c2 = createClient('client-2');
    const page1: PullPage = {
      events: [serverEvents[2], serverEvents[0], serverEvents[1]],
      next_cursor: 3,
    };
    const page2: PullPage = {
      events: [serverEvents[5], serverEvents[3], serverEvents[4]],
      next_cursor: 6,
    };
    c2 = applyPull(c2, page1);
    c2 = applyPull(c2, page2);

    const config = { minDelayMs: 60000 };
    const res1 = deriveFromClient(c1, 'unit-sync', config);
    const res2 = deriveFromClient(c2, 'unit-sync', config);
    assert.deepStrictEqual(res1, res2);

    // Client 3: 3 split pages of 2 items each, scrambled
    let c3 = createClient('client-3');
    c3 = applyPull(c3, { events: [serverEvents[1], serverEvents[0]], next_cursor: 2 });
    c3 = applyPull(c3, { events: [serverEvents[3], serverEvents[2]], next_cursor: 4 });
    c3 = applyPull(c3, { events: [serverEvents[5], serverEvents[4]], next_cursor: 6 });
    const res3 = deriveFromClient(c3, 'unit-sync', config);
    assert.deepStrictEqual(res1, res3);
  });

  it('immutability: deep-freeze all inputs; no function mutates its input', () => {
    let client = deepFreeze(createClient('dev-immutable'));
    const ev = deepFreeze(makeEvent('ev-imm'));

    // recordLocalEvent does not mutate state or event
    const rec = recordLocalEvent(client, ev);
    assert.strictEqual(rec.outcome, 'recorded');
    client = deepFreeze(rec.state);

    // prepareBatch does not mutate client
    const batch = prepareBatch(client, 10);
    assert.strictEqual(batch.length, 1);

    // applyPushResponse does not mutate state or response
    const pushResp: PushResponse = deepFreeze({
      accepted: [{ event_id: 'ev-imm', server_seq: 1, received_at: '2026-01-01T10:00:00Z' }],
      rejected: [],
      retryable: [],
    });
    const afterPush = deepFreeze(applyPushResponse(client, pushResp));
    assert.strictEqual(unsyncedCount(afterPush), 0);

    // applyPull does not mutate state or page
    const pullPage: PullPage = deepFreeze({
      events: [
        {
          raw: makeEvent('ev-pull-imm'),
          device_id: 'dev-other',
          device_seq: 1,
          server_seq: 2,
          received_at: '2026-01-01T10:01:00Z',
        },
      ],
      next_cursor: 2,
    });
    const afterPull = applyPull(afterPush, pullPage);
    assert.strictEqual(afterPull.cursor, 2);

    // activeEvents and deriveFromClient do not mutate state
    const acts = activeEvents(afterPull);
    assert.strictEqual(acts.length, 2);
    const der = deriveFromClient(afterPull, 'unit-sync', { minDelayMs: 60000 });
    assert.ok(der);
  });

  it('accepted entry with missing server_seq, with 0, with 1.5, or with missing received_at leaves the event in the outbox and its server fields unset', () => {
    let client = createClient('dev-1');
    const e1 = makeEvent('e1');
    const e2 = makeEvent('e2');
    const e3 = makeEvent('e3');
    const e4 = makeEvent('e4');
    client = recordLocalEvent(client, e1).state;
    client = recordLocalEvent(client, e2).state;
    client = recordLocalEvent(client, e3).state;
    client = recordLocalEvent(client, e4).state;

    const resp = {
      accepted: [
        { event_id: 'e1', received_at: '2026-01-01T10:00:00Z' } as any,
        { event_id: 'e2', server_seq: 0, received_at: '2026-01-01T10:00:00Z' },
        { event_id: 'e3', server_seq: 1.5, received_at: '2026-01-01T10:00:00Z' },
        { event_id: 'e4', server_seq: 4 } as any,
      ],
      rejected: [],
      retryable: [],
    };

    const afterPush = applyPushResponse(client, resp);
    assert.deepStrictEqual(afterPush.outbox, ['e1', 'e2', 'e3', 'e4']);
    for (const st of afterPush.events) {
      assert.strictEqual(st.server_seq, undefined);
      assert.strictEqual(st.received_at, undefined);
    }
  });

  it('rejected entry for an unknown id is not recorded; rejected entry with a non-string reason is ignored', () => {
    let client = createClient('dev-1');
    const e1 = makeEvent('e1');
    client = recordLocalEvent(client, e1).state;

    const resp = {
      accepted: [],
      rejected: [
        { event_id: 'unknown-id', reason: 'bad' },
        { event_id: 'e1', reason: 123 as any },
      ],
      retryable: [],
    };

    const afterPush = applyPushResponse(client, resp);
    assert.strictEqual(afterPush.rejected.length, 0);
    assert.deepStrictEqual(afterPush.outbox, ['e1']);
  });

  it('a second acknowledgement with a different server_seq keeps the first one', () => {
    let client = createClient('dev-1');
    const e1 = makeEvent('e1');
    client = recordLocalEvent(client, e1).state;

    const resp1: PushResponse = {
      accepted: [{ event_id: 'e1', server_seq: 10, received_at: '2026-01-01T10:00:00Z' }],
      rejected: [],
      retryable: [],
    };
    const after1 = applyPushResponse(client, resp1);
    assert.strictEqual(after1.events[0].server_seq, 10);
    assert.strictEqual(after1.events[0].received_at, '2026-01-01T10:00:00Z');

    const resp2: PushResponse = {
      accepted: [{ event_id: 'e1', server_seq: 20, received_at: '2026-01-01T10:05:00Z' }],
      rejected: [],
      retryable: [],
    };
    const after2 = applyPushResponse(after1, resp2);
    assert.strictEqual(after2.events[0].server_seq, 10);
    assert.strictEqual(after2.events[0].received_at, '2026-01-01T10:00:00Z');
  });

  it('page with one item (server_seq 5) and next_cursor 9 -> state unchanged; the same page with next_cursor 5 -> accepted; an empty page with next_cursor greater than the cursor -> unchanged; an empty page with next_cursor equal to the cursor -> accepted', () => {
    const client = createClient('dev-1');
    const item: ServerEvent = {
      raw: makeEvent('ev-5'),
      device_id: 'dev-srv',
      device_seq: 1,
      server_seq: 5,
      received_at: '2026-01-01T10:00:00Z',
    };

    // one item (server_seq 5) and next_cursor 9 -> state unchanged
    const page9: PullPage = { events: [item], next_cursor: 9 };
    const res9 = applyPull(client, page9);
    assert.strictEqual(res9, client);

    // the same page with next_cursor 5 -> accepted
    const page5: PullPage = { events: [item], next_cursor: 5 };
    const res5 = applyPull(client, page5);
    assert.strictEqual(res5.cursor, 5);
    assert.strictEqual(res5.events.length, 1);

    // an empty page with next_cursor greater than the cursor -> unchanged
    const emptyGreater: PullPage = { events: [], next_cursor: 6 };
    const resEmptyGreater = applyPull(res5, emptyGreater);
    assert.strictEqual(resEmptyGreater, res5);

    // an empty page with next_cursor equal to the cursor -> accepted
    const emptyEqual: PullPage = { events: [], next_cursor: 5 };
    const resEmptyEqual = applyPull(res5, emptyEqual);
    assert.strictEqual(resEmptyEqual.cursor, 5);
  });

  it('next_cursor of 1.5, NaN, Infinity and "5" (a string) -> state unchanged', () => {
    const client = createClient('dev-1');
    for (const badCursor of [1.5, NaN, Infinity, '5' as any]) {
      const page = { events: [], next_cursor: badCursor } as any;
      const res = applyPull(client, page);
      assert.strictEqual(res, client);
    }
  });

  it('an item with server_seq <= cursor and different content is ignored (no conflict, no change)', () => {
    let client = createClient('dev-1');
    const localEv = makeEvent('ev-same-id', { result: 'correct' });
    client = recordLocalEvent(client, localEv).state;

    // Advance cursor to 10
    const primePage: PullPage = {
      events: [
        {
          raw: makeEvent('ev-prime'),
          device_id: 'dev-srv',
          device_seq: 1,
          server_seq: 10,
          received_at: '2026-01-01T10:00:00Z',
        },
      ],
      next_cursor: 10,
    };
    client = applyPull(client, primePage);
    assert.strictEqual(client.cursor, 10);
    assert.strictEqual(client.conflicts.length, 0);

    // Pull an item with server_seq <= cursor (server_seq 5 <= 10) and different content for ev-same-id
    const diffServerEv = makeEvent('ev-same-id', { result: 'incorrect' });
    const stalePage: PullPage = {
      events: [
        {
          raw: diffServerEv,
          device_id: 'dev-srv',
          device_seq: 2,
          server_seq: 5,
          received_at: '2026-01-01T09:00:00Z',
        },
      ],
      next_cursor: 10,
    };
    const afterStale = applyPull(client, stalePage);
    // No conflict, no change to local event
    assert.strictEqual(afterStale.conflicts.length, 0);
    assert.strictEqual(afterStale.events[0].event.result, 'correct');
    assert.strictEqual(afterStale.cursor, 10);
  });

  it('replaying the same garbage page three times gives the same quarantined list as once', () => {
    const client = createClient('dev-1');
    const garbagePage: PullPage = {
      events: [
        null as any,
        { foo: 'bar' } as any,
        {
          raw: { ...makeEvent('ev-bad'), occurred_at: 'not-iso' },
          device_id: 'srv',
          device_seq: 1,
          server_seq: 1,
          received_at: '2026-01-01T10:00:00Z',
        },
        null as any, // duplicate within same page
      ],
      next_cursor: 1,
    };

    const play1 = applyPull(client, garbagePage);
    assert.ok(play1.quarantined.length > 0);
    const countOnce = play1.quarantined.length;

    const play2 = applyPull(play1, garbagePage);
    assert.strictEqual(play2.quarantined.length, countOnce);

    const play3 = applyPull(play2, garbagePage);
    assert.strictEqual(play3.quarantined.length, countOnce);
    assert.deepStrictEqual(play3.quarantined, play1.quarantined);
  });

  it('accepted ack with received_at "" leaves the event in the outbox', () => {
    let client = createClient('dev-1');
    const ev = makeEvent('ev-empty-rec');
    client = recordLocalEvent(client, ev).state;

    const resp = {
      accepted: [{ event_id: 'ev-empty-rec', server_seq: 1, received_at: '' }],
      rejected: [],
      retryable: [],
    };
    const after = applyPushResponse(client, resp);
    assert.deepStrictEqual(after.outbox, ['ev-empty-rec']);
    assert.strictEqual(after.events[0].server_seq, undefined);
  });

  it('accepted ack for an unknown event id is ignored without throwing', () => {
    let client = createClient('dev-1');
    const ev = makeEvent('ev-known');
    client = recordLocalEvent(client, ev).state;

    const resp = {
      accepted: [{ event_id: 'ev-unknown-999', server_seq: 1, received_at: '2026-01-01T10:00:00Z' }],
      rejected: [],
      retryable: [],
    };
    const after = applyPushResponse(client, resp);
    assert.deepStrictEqual(after.outbox, ['ev-known']);
  });

  it('a pull page whose items all have server_seq <= cursor and next_cursor equal to the cursor is accepted and changes nothing', () => {
    let client = createClient('dev-1');
    const primePage: PullPage = {
      events: [
        {
          raw: makeEvent('ev-1'),
          device_id: 'dev-srv',
          device_seq: 1,
          server_seq: 5,
          received_at: '2026-01-01T10:00:00Z',
        },
      ],
      next_cursor: 5,
    };
    client = applyPull(client, primePage);
    assert.strictEqual(client.cursor, 5);

    const stalePage: PullPage = {
      events: [
        {
          raw: makeEvent('ev-old'),
          device_id: 'dev-srv',
          device_seq: 2,
          server_seq: 3,
          received_at: '2026-01-01T09:00:00Z',
        },
      ],
      next_cursor: 5,
    };
    const afterStale = applyPull(client, stalePage);
    assert.strictEqual(afterStale.cursor, 5);
    assert.strictEqual(afterStale.events.length, 1);
    assert.strictEqual(afterStale.conflicts.length, 0);
  });

  it('an item with valid metadata but no "raw" property is quarantined', () => {
    const client = createClient('dev-1');
    const noRawItem = {
      device_id: 'dev-srv',
      device_seq: 1,
      server_seq: 1,
      received_at: '2026-01-01T10:00:00Z',
    };
    const page: PullPage = {
      events: [noRawItem as any],
      next_cursor: 0,
    };
    const res = applyPull(client, page);
    assert.strictEqual(res.quarantined.length, 1);
    assert.strictEqual(res.quarantined[0].reason, 'malformed_sync_metadata');
  });

  it('two quarantine entries with equal raw but different reasons are both kept', () => {
    const client = createClient('dev-1');
    const duplicateRaw = { dummy: 'value' };
    const page: PullPage = {
      events: [
        null as any, // malformed_item
        { raw: duplicateRaw, device_id: 123 /* bad meta */ } as any, // malformed_sync_metadata with raw duplicateRaw
        { raw: duplicateRaw, reason: 'forced' } as any, // malformed_sync_metadata
      ],
      next_cursor: 0,
    };
    // Let's create an item that fails with malformed_sync_metadata having raw: duplicateRaw,
    // and an item where raw is duplicateRaw and classification is invalid_event.
    const validMetaInvalidRaw: ServerEvent = {
      raw: duplicateRaw, // classifyIncoming(duplicateRaw) -> 'invalid'
      device_id: 'dev-srv',
      device_seq: 1,
      server_seq: 1,
      received_at: '2026-01-01T10:00:00Z',
    };
    const metaWithoutDeviceSeq = {
      raw: duplicateRaw,
      device_id: 'dev-srv',
      server_seq: 2,
      received_at: '2026-01-01T10:00:00Z',
    };
    const testPage: PullPage = {
      events: [
        metaWithoutDeviceSeq as any, // malformed_sync_metadata with raw duplicateRaw
        validMetaInvalidRaw, // invalid_event with raw duplicateRaw
      ],
      next_cursor: 1,
    };
    const res = applyPull(client, testPage);
    assert.strictEqual(res.quarantined.length, 2);
    assert.ok(res.quarantined.some(q => q.reason === 'malformed_sync_metadata'));
    assert.ok(res.quarantined.some(q => q.reason === 'invalid_event'));
  });

  it('the purity test also scans sync.ts and admissibility.ts', () => {
    const filesToScan = ['src/kernel/sync.ts', 'src/kernel/admissibility.ts'];
    const forbiddenTokens = [
      'Date.now(',
      'new Date()',
      'Math.random',
      '"fs"',
      "'fs'",
      '"process"',
      "'process'",
      'fetch(',
    ];

    for (const relPath of filesToScan) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `${relPath} does not exist`);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const token of forbiddenTokens) {
        assert.ok(!content.includes(token), `Forbidden token "${token}" found in ${relPath}`);
      }

      const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const importSource = match[1];
        assert.ok(
          importSource.startsWith('./') || importSource.startsWith('../'),
          `External import "${importSource}" found in ${relPath}`
        );
      }
    }
  });
});
