import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  eventsToJsonl,
  buildBackup,
  parseBackup,
  mergeBackup,
  BackupFile,
} from '../src/app/backup.js';
import { sha256HexViaSubtle } from '../src/ui/backupIo.js';
import type { ClientState, StoredEvent } from '../src/kernel/index.js';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === 'object') deepFreeze(val);
  }
  return obj;
}

function makeStoredEvent(
  id: string,
  deviceId = 'dev-1',
  seq = 1,
  serverSeq?: number,
  receivedAt?: string
): StoredEvent {
  const e: StoredEvent = {
    event: {
      event_id: id,
      payload_type: 'item_response',
      payload_version: 1,
      payload: { item_id: 'r1', response: 'gone' },
      unit_refs: ['grammar:go-went-gone'],
      skill: 'grammar',
      modality: 'receptive_written',
      task_class: 'recognition_item',
      context_id: 'home',
      evaluator: { type: 'deterministic', id: 'closed_item', version: '1' },
      reliability: 'usable',
      result: 'correct',
      occurred_at: '2026-05-18T00:00:00.000Z',
      recorded_at: '2026-05-18T00:00:00.000Z',
    },
    device_id: deviceId,
    device_seq: seq,
  };
  if (serverSeq !== undefined) e.server_seq = serverSeq;
  if (receivedAt !== undefined) e.received_at = receivedAt;
  return e;
}

function makeState(events: StoredEvent[] = [], deviceId = 'dev-1', cursor = 0): ClientState {
  return {
    device_id: deviceId,
    next_device_seq: events.length + 1,
    events,
    outbox: events.filter((e) => e.server_seq === undefined).map((e) => e.event.event_id),
    rejected: [],
    cursor,
    opaque: [],
    quarantined: [],
    conflicts: [],
  };
}

describe('ELOS Milestone G3 - Backup export/import', () => {
  const dummySha = async (s: string) => `hash-${s.length}`;

  describe('eventsToJsonl', () => {
    it('serializes empty events array to empty string', () => {
      assert.strictEqual(eventsToJsonl([]), '');
    });

    it('serializes events with optional fields handled correctly', () => {
      const e1 = makeStoredEvent('ev-1', 'dev-1', 1);
      const e2 = makeStoredEvent('ev-2', 'dev-2', 5, 42, '2026-05-18T10:00:00.000Z');
      const jsonl = eventsToJsonl([e1, e2]);
      const lines = jsonl.split('\n');
      assert.strictEqual(lines.length, 2);

      const parsed1 = JSON.parse(lines[0]);
      assert.strictEqual(parsed1.device_id, 'dev-1');
      assert.strictEqual(parsed1.device_seq, 1);
      assert.strictEqual(parsed1.server_seq, undefined);
      assert.strictEqual(parsed1.received_at, undefined);

      const parsed2 = JSON.parse(lines[1]);
      assert.strictEqual(parsed2.device_id, 'dev-2');
      assert.strictEqual(parsed2.server_seq, 42);
      assert.strictEqual(parsed2.received_at, '2026-05-18T10:00:00.000Z');
    });
  });

  describe('buildBackup', () => {
    it('creates a compliant BackupFile and does not mutate state', async () => {
      const state = deepFreeze(makeState([makeStoredEvent('ev-1')], 'dev-test', 7));
      const backup = await buildBackup(state, '2026-05-18T12:00:00.000Z', dummySha);

      assert.strictEqual(backup.format, 'elos-backup-1');
      assert.strictEqual(backup.created_at, '2026-05-18T12:00:00.000Z');
      assert.strictEqual(backup.device_id, 'dev-test');
      assert.strictEqual(backup.cursor, 7);
      assert.strictEqual(backup.event_count, 1);
      assert.strictEqual(backup.events.length, 1);
      assert.strictEqual(backup.events_sha256, await dummySha(eventsToJsonl(state.events)));
    });
  });

  describe('parseBackup', () => {
    it('rejects invalid JSON', async () => {
      const res = await parseBackup('{bad json', dummySha);
      assert.strictEqual(res.kind, 'invalid');
      assert.strictEqual((res as { reason: string }).reason, 'not valid JSON');
    });

    it('rejects non-object or wrong format', async () => {
      let res = await parseBackup('42', dummySha);
      assert.strictEqual((res as { reason: string }).reason, 'not an ELOS backup');
      res = await parseBackup('[]', dummySha);
      assert.strictEqual((res as { reason: string }).reason, 'not an ELOS backup');
      res = await parseBackup(JSON.stringify({ format: 'elos-2' }), dummySha);
      assert.strictEqual((res as { reason: string }).reason, 'not an ELOS backup');
    });

    it('rejects bad manifest fields', async () => {
      const res = await parseBackup(
        JSON.stringify({ format: 'elos-backup-1', created_at: 123 }),
        dummySha
      );
      assert.strictEqual((res as { reason: string }).reason, 'bad manifest');
    });

    it('rejects event count mismatch', async () => {
      const res = await parseBackup(
        JSON.stringify({
          format: 'elos-backup-1',
          created_at: '2026-05-18T12:00:00.000Z',
          device_id: 'dev-1',
          cursor: 0,
          event_count: 5,
          events: [],
        }),
        dummySha
      );
      assert.strictEqual((res as { reason: string }).reason, 'event_count mismatch');
    });

    it('rejects malformed event inside events array', async () => {
      const res = await parseBackup(
        JSON.stringify({
          format: 'elos-backup-1',
          created_at: '2026-05-18T12:00:00.000Z',
          device_id: 'dev-1',
          cursor: 0,
          event_count: 1,
          events: [{ device_id: 'd1' }],
        }),
        dummySha
      );
      assert.strictEqual((res as { reason: string }).reason, 'bad event at index 0');
    });

    it('rejects checksum mismatch', async () => {
      const res = await parseBackup(
        JSON.stringify({
          format: 'elos-backup-1',
          created_at: '2026-05-18T12:00:00.000Z',
          device_id: 'dev-1',
          cursor: 0,
          event_count: 0,
          events: [],
          events_sha256: 'tampered-hash',
        }),
        dummySha
      );
      assert.strictEqual((res as { reason: string }).reason, 'checksum mismatch');
    });

    it('accepts valid backup', async () => {
      const e = makeStoredEvent('ev-1');
      const sha = await dummySha(eventsToJsonl([e]));
      const res = await parseBackup(
        JSON.stringify({
          format: 'elos-backup-1',
          created_at: '2026-05-18T12:00:00.000Z',
          device_id: 'dev-1',
          cursor: 3,
          event_count: 1,
          events_sha256: sha,
          events: [e],
        }),
        dummySha
      );
      assert.strictEqual(res.kind, 'ok');
    });
  });

  describe('sha256HexViaSubtle', () => {
    it('computes expected SHA-256 for test vector "abc"', async () => {
      const hash = await sha256HexViaSubtle('abc');
      assert.strictEqual(
        hash,
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
    });

    it('performs full round trip build -> serialize -> parse', async () => {
      const state = makeState([makeStoredEvent('ev-roundtrip')], 'dev-rt', 12);
      const backup = await buildBackup(state, '2026-05-18T12:30:00.000Z', sha256HexViaSubtle);
      const serialized = JSON.stringify(backup, null, 2);
      const parsed = await parseBackup(serialized, sha256HexViaSubtle);

      assert.strictEqual(parsed.kind, 'ok');
      if (parsed.kind === 'ok') {
        assert.strictEqual(parsed.backup.event_count, 1);
        assert.strictEqual(parsed.backup.events[0].event.event_id, 'ev-roundtrip');
      }
    });
  });

  describe('mergeBackup', () => {
    it('adds disjoint events and queues unsynced ones into outbox', () => {
      const state = deepFreeze(makeState([makeStoredEvent('ev-1', 'dev-1', 1, 10)], 'dev-1', 10));
      const backup: BackupFile = deepFreeze({
        format: 'elos-backup-1',
        created_at: '2026-05-18T12:00:00.000Z',
        device_id: 'dev-2',
        cursor: 15,
        event_count: 2,
        events_sha256: 'mock',
        events: [
          makeStoredEvent('ev-2', 'dev-2', 1),
          makeStoredEvent('ev-3', 'dev-2', 2, 12),
        ],
      });

      const res = mergeBackup(state, backup);
      assert.strictEqual(res.added, 2);
      assert.strictEqual(res.merged, 0);
      assert.strictEqual(res.state.events.length, 3);
      assert.strictEqual(res.state.cursor, 15);
      // ev-2 has no server_seq so it was queued to outbox; ev-3 has server_seq so not queued
      assert.deepStrictEqual(res.state.outbox, ['ev-2']);
    });

    it('skips duplicate events and updates next_device_seq for same device', () => {
      const state = deepFreeze(makeState([makeStoredEvent('ev-1', 'dev-1', 1)], 'dev-1', 5));
      const backup: BackupFile = deepFreeze({
        format: 'elos-backup-1',
        created_at: '2026-05-18T12:00:00.000Z',
        device_id: 'dev-1',
        cursor: 3,
        event_count: 2,
        events_sha256: 'mock',
        events: [
          makeStoredEvent('ev-1', 'dev-1', 1),
          makeStoredEvent('ev-4', 'dev-1', 9),
        ],
      });

      const res = mergeBackup(state, backup);
      assert.strictEqual(res.added, 1);
      assert.strictEqual(res.merged, 1);
      assert.strictEqual(res.state.events.length, 2);
      // next_device_seq advances to 9 + 1 = 10
      assert.strictEqual(res.state.next_device_seq, 10);
      // cursor remains max(5, 3) = 5
      assert.strictEqual(res.state.cursor, 5);
    });
  });

  describe('layering scan', () => {
    it('no file under src/app imports from ui/', () => {
      const projectRoot = process.cwd();
      const appDir = path.join(projectRoot, 'src', 'app');
      const files = fs.readdirSync(appDir).filter((f) => f.endsWith('.ts'));

      for (const file of files) {
        const fullPath = path.join(appDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const importsUi = /from\s+['"][^'"]*\/ui(\/|['"])/.test(content);
        assert.ok(
          !importsUi,
          `src/app/${file} violates layering by importing from ui/`
        );
      }
    });
  });
});
