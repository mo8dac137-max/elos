import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  createClient,
  deriveFromClient,
  unsyncedCount,
  validateEvent,
  ClientState,
} from '../src/kernel/index.js';
import {
  EXERCISE_BANK,
  Exercise,
  normalizeAnswer,
  checkAnswer,
  buildEvidenceEvent,
  pickNextItem,
  submitAnswer,
  serializeState,
  parseState,
  InMemoryClientStore,
} from '../src/app/index.js';

describe('ELOS App & Exercise Logic - Milestone D', () => {
  it('checkAnswer normalization; every bank item has its answer inside its options for recognition items; ids unique; the bank has exactly the 8 items above', () => {
    // Exact 8 items
    assert.strictEqual(EXERCISE_BANK.length, 8);

    const expectedIds = ['r1', 'r2', 'r3', 'r4', 'c1', 'c2', 'c3', 'c4'];
    const ids = EXERCISE_BANK.map(e => e.id);
    assert.deepStrictEqual(ids, expectedIds);
    assert.strictEqual(new Set(ids).size, 8);

    // Recognition items have answer inside options
    const recognitionItems = EXERCISE_BANK.filter(e => e.task_class === 'recognition_item');
    assert.strictEqual(recognitionItems.length, 4);
    for (const item of recognitionItems) {
      assert.ok(item.options, `Exercise ${item.id} must have options`);
      assert.ok(item.options!.includes(item.answer), `Exercise ${item.id} options must include answer`);
    }

    const recallItems = EXERCISE_BANK.filter(e => e.task_class === 'controlled_recall');
    assert.strictEqual(recallItems.length, 4);

    // Normalization check
    const r1 = EXERCISE_BANK[0];
    assert.strictEqual(checkAnswer(r1, 'GONE'), true);
    assert.strictEqual(checkAnswer(r1, ' gone. '), true);
    assert.strictEqual(checkAnswer(r1, 'gone'), true);
    assert.strictEqual(checkAnswer(r1, 'went'), false);
    assert.strictEqual(checkAnswer(r1, 'go'), false);

    const c1 = EXERCISE_BANK[4];
    assert.strictEqual(checkAnswer(c1, 'GONE'), true);
    assert.strictEqual(checkAnswer(c1, ' Gone. '), true);
    assert.strictEqual(checkAnswer(c1, 'went'), false);
  });

  it('buildEvidenceEvent output passes validateEvent for each class and sets modality/task_class/context_id/evaluator as specified; deterministic with a fake clock and fake id generator', () => {
    let tick = 0;
    const fakeCtx = {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => `test-ev-${++tick}`,
    };

    const rItem = EXERCISE_BANK[0]; // r1, recognition_item
    const evRec = buildEvidenceEvent(rItem, 'gone', fakeCtx);
    const valRec = validateEvent(evRec);
    assert.strictEqual(valRec.ok, true);
    assert.strictEqual(evRec.event_id, 'test-ev-1');
    assert.strictEqual(evRec.payload_type, 'item_response');
    assert.strictEqual(evRec.payload_version, 1);
    assert.deepStrictEqual(evRec.payload, { item_id: 'r1', response: 'gone' });
    assert.deepStrictEqual(evRec.unit_refs, ['grammar:go-went-gone']);
    assert.strictEqual(evRec.skill, 'grammar');
    assert.strictEqual(evRec.modality, 'receptive_written');
    assert.strictEqual(evRec.task_class, 'recognition_item');
    assert.strictEqual(evRec.context_id, 'home');
    assert.deepStrictEqual(evRec.evaluator, { type: 'deterministic', id: 'closed_item', version: '1' });
    assert.strictEqual(evRec.reliability, 'usable');
    assert.strictEqual(evRec.result, 'correct');
    assert.strictEqual(evRec.occurred_at, '2026-01-01T10:00:00.000Z');
    assert.strictEqual(evRec.recorded_at, '2026-01-01T10:00:00.000Z');

    const cItem = EXERCISE_BANK[4]; // c1, controlled_recall
    const evRecall = buildEvidenceEvent(cItem, 'wrong_answer', fakeCtx);
    const valRecall = validateEvent(evRecall);
    assert.strictEqual(valRecall.ok, true);
    assert.strictEqual(evRecall.event_id, 'test-ev-2');
    assert.strictEqual(evRecall.modality, 'productive_written');
    assert.strictEqual(evRecall.task_class, 'controlled_recall');
    assert.strictEqual(evRecall.context_id, 'out');
    assert.strictEqual(evRecall.result, 'incorrect');
  });

  it('submitAnswer: a correct recognition answer on an empty client yields "exposure" (first usable event); a second correct recognition answer yields "recognition"; then a correct controlled_recall yields "controlled"; incorrect answers never advance; the event is in the outbox (unsyncedCount grows)', () => {
    let timeMs = 1767264000000;
    let idSeq = 0;
    const ctx = {
      now: () => new Date(timeMs++).toISOString(),
      newId: () => `ev-${++idSeq}`,
    };

    let client = createClient('dev-test');
    const unitId = 'grammar:go-went-gone';
    const config = { minDelayMs: 60000 };

    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'unknown');
    assert.strictEqual(unsyncedCount(client), 0);

    // 1st correct recognition answer -> exposure
    const r1 = EXERCISE_BANK[0];
    const res1 = submitAnswer(client, r1, 'gone', ctx);
    assert.strictEqual(res1.correct, true);
    client = res1.state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'exposure');
    assert.strictEqual(unsyncedCount(client), 1);
    assert.ok(client.outbox.includes(res1.event.event_id));

    // 2nd correct recognition answer -> recognition
    const r2 = EXERCISE_BANK[1];
    const res2 = submitAnswer(client, r2, 'went', ctx);
    assert.strictEqual(res2.correct, true);
    client = res2.state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'recognition');
    assert.strictEqual(unsyncedCount(client), 2);

    // 3rd correct controlled_recall answer -> controlled
    const c1 = EXERCISE_BANK[4];
    const res3 = submitAnswer(client, c1, 'gone', ctx);
    assert.strictEqual(res3.correct, true);
    client = res3.state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'controlled');
    assert.strictEqual(unsyncedCount(client), 3);

    // Incorrect answer never advances state
    const c2 = EXERCISE_BANK[5];
    const resIncorrect = submitAnswer(client, c2, 'wrong', ctx);
    assert.strictEqual(resIncorrect.correct, false);
    client = resIncorrect.state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'controlled');
    assert.strictEqual(unsyncedCount(client), 4);

    // On exposure state, an incorrect answer never advances state to recognition
    let exposureClient = createClient('dev-exp');
    exposureClient = submitAnswer(exposureClient, r1, 'gone', ctx).state;
    assert.strictEqual(deriveFromClient(exposureClient, unitId, config).state, 'exposure');
    const resWrongOnExposure = submitAnswer(exposureClient, r2, 'wrong', ctx);
    assert.strictEqual(resWrongOnExposure.correct, false);
    assert.strictEqual(deriveFromClient(resWrongOnExposure.state, unitId, config).state, 'exposure');
    assert.strictEqual(unsyncedCount(resWrongOnExposure.state), 2);
  });

  it('pickNextItem: exposure/unknown -> recognition item; recognition -> controlled_recall; never returns lastItemId when another candidate exists; picks the least-answered; deterministic', () => {
    let client = createClient('dev-planner');
    const unitId = 'grammar:go-went-gone';
    const config = { minDelayMs: 60000 };

    let idSeq = 0;
    const ctx = {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => `planner-ev-${++idSeq}`,
    };

    // Unknown -> recognition_item
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'unknown');
    const pick1 = pickNextItem(client, EXERCISE_BANK, null);
    assert.strictEqual(pick1.task_class, 'recognition_item');
    assert.strictEqual(pick1.id, 'r1'); // ties broken by bank order

    // Deterministic: multiple calls return same item
    const pick1Repeat = pickNextItem(client, EXERCISE_BANK, null);
    assert.strictEqual(pick1Repeat.id, pick1.id);

    // Advance to exposure
    client = submitAnswer(client, pick1, 'gone', ctx).state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'exposure');

    // Exposure -> still recognition_item, but lastItemId exclusion applies
    const pick2 = pickNextItem(client, EXERCISE_BANK, pick1.id);
    assert.strictEqual(pick2.task_class, 'recognition_item');
    assert.notStrictEqual(pick2.id, pick1.id);
    assert.strictEqual(pick2.id, 'r2'); // least-answered tie-broken by bank order

    // Advance to recognition
    client = submitAnswer(client, pick2, 'went', ctx).state;
    assert.strictEqual(deriveFromClient(client, unitId, config).state, 'recognition');

    // Recognition -> controlled_recall
    const pick3 = pickNextItem(client, EXERCISE_BANK, pick2.id);
    assert.strictEqual(pick3.task_class, 'controlled_recall');
    assert.strictEqual(pick3.id, 'c1');

    // Picks least-answered
    client = submitAnswer(client, pick3, 'gone', ctx).state; // c1 answered once
    const pick4 = pickNextItem(client, EXERCISE_BANK, null); // lastItemId is null
    // c1 has count 1, c2, c3, c4 have count 0 -> picks c2
    assert.strictEqual(pick4.id, 'c2');
  });

  it('storage: serialize/parse round trip equals the original state; parse of garbage, of "{}", of a state with a wrong field type returns corrupt without throwing; InMemoryClientStore contract (empty -> save -> ok)', async () => {
    let client = createClient('dev-storage');
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => 'ev-storage-1',
    }).state;

    // Round trip
    const serialized = serializeState(client);
    const parsed = parseState(serialized);
    assert.strictEqual(parsed.status, 'ok');
    if (parsed.status === 'ok') {
      assert.deepStrictEqual(parsed.state, client);
    }

    // Garbage JSON
    const badJson = parseState('not-json{{{');
    assert.strictEqual(badJson.status, 'corrupt');
    if (badJson.status === 'corrupt') {
      assert.strictEqual(badJson.raw, 'not-json{{{');
    }

    // Empty object "{}"
    const emptyObj = parseState('{}');
    assert.strictEqual(emptyObj.status, 'corrupt');

    // Wrong field type (e.g. cursor is string)
    const badStateJson = JSON.stringify({ ...client, cursor: 'invalid-cursor' });
    const badField = parseState(badStateJson);
    assert.strictEqual(badField.status, 'corrupt');

    // InMemoryClientStore contract
    const store = new InMemoryClientStore();
    const load1 = await store.load();
    assert.deepStrictEqual(load1, { status: 'empty' });

    await store.save(client);
    const load2 = await store.load();
    assert.strictEqual(load2.status, 'ok');
    if (load2.status === 'ok') {
      assert.deepStrictEqual(load2.state, client);
    }
  });

  it('parseState returns "corrupt" without throwing for each of: "null", "[]", "5", a state missing outbox, a state with non-integer device_seq in an event, events not an array, conflicts with a wrong item type, next_device_seq 0, and a negative cursor', () => {
    const baseClient = createClient('dev-corrupt-check');
    const validState = JSON.parse(serializeState(baseClient));

    // 1. "null"
    assert.strictEqual(parseState('null').status, 'corrupt');

    // 2. "[]"
    assert.strictEqual(parseState('[]').status, 'corrupt');

    // 3. "5"
    assert.strictEqual(parseState('5').status, 'corrupt');

    // 4. a state missing outbox
    const missingOutbox = { ...validState };
    delete missingOutbox.outbox;
    assert.strictEqual(parseState(JSON.stringify(missingOutbox)).status, 'corrupt');

    // 5. a state with non-integer device_seq in an event
    const nonIntDeviceSeq = {
      ...validState,
      events: [
        {
          device_id: 'dev-corrupt-check',
          device_seq: 1.5,
          event: { event_id: 'e1' },
        },
      ],
    };
    assert.strictEqual(parseState(JSON.stringify(nonIntDeviceSeq)).status, 'corrupt');

    // 6. events not an array
    const eventsNotArray = { ...validState, events: 'not-an-array' };
    assert.strictEqual(parseState(JSON.stringify(eventsNotArray)).status, 'corrupt');

    // 7. conflicts with a wrong item type
    const badConflicts = { ...validState, conflicts: ['not-an-object'] };
    assert.strictEqual(parseState(JSON.stringify(badConflicts)).status, 'corrupt');

    // 8. next_device_seq 0
    const seqZero = { ...validState, next_device_seq: 0 };
    assert.strictEqual(parseState(JSON.stringify(seqZero)).status, 'corrupt');

    // 9. a negative cursor
    const negCursor = { ...validState, cursor: -1 };
    assert.strictEqual(parseState(JSON.stringify(negCursor)).status, 'corrupt');
  });

  it('pickNextItem never returns lastItemId when another candidate of the wanted class exists', () => {
    const client = createClient('dev-pick-check');

    // In 'unknown' state, wanted class is 'recognition_item' (4 items: r1, r2, r3, r4)
    const recognitionItems = EXERCISE_BANK.filter(e => e.task_class === 'recognition_item');
    for (const item of recognitionItems) {
      const picked = pickNextItem(client, EXERCISE_BANK, item.id);
      assert.notStrictEqual(picked.id, item.id);
      assert.strictEqual(picked.task_class, 'recognition_item');
    }

    // Now advance client to 'recognition' state where wanted class is 'controlled_recall' (c1, c2, c3, c4)
    let time = 1700000000000;
    let idGen = 0;
    const ctx = {
      now: () => new Date(time++).toISOString(),
      newId: () => `ev-${++idGen}`,
    };
    const cRec1 = submitAnswer(client, EXERCISE_BANK[0], 'gone', ctx).state;
    const cRec2 = submitAnswer(cRec1, EXERCISE_BANK[1], 'went', ctx).state;
    assert.strictEqual(deriveFromClient(cRec2, 'grammar:go-went-gone', { minDelayMs: 60000 }).state, 'recognition');

    const recallItems = EXERCISE_BANK.filter(e => e.task_class === 'controlled_recall');
    for (const item of recallItems) {
      const picked = pickNextItem(cRec2, EXERCISE_BANK, item.id);
      assert.notStrictEqual(picked.id, item.id);
      assert.strictEqual(picked.task_class, 'controlled_recall');
    }
  });

  it('submitAnswer throws when recordLocalEvent does not return "recorded" (for example a repeated event id with identical content)', () => {
    const client = createClient('dev-submit-check');
    const r1 = EXERCISE_BANK[0];
    const fixedCtx = {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => 'fixed-id-duplicate',
    };

    const firstSubmit = submitAnswer(client, r1, 'gone', fixedCtx);
    assert.strictEqual(firstSubmit.correct, true);

    // Submitting again with identical event_id and identical content produces outcome "duplicate"
    assert.throws(
      () => {
        submitAnswer(firstSubmit.state, r1, 'gone', fixedCtx);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.includes('Failed to record event');
      }
    );
  });

  it('purity: files in src/app must not use Date.now(, new Date(), Math.random, crypto, document, window, fetch(, localStorage, indexedDB (scan test), and must import nothing from src/ui', () => {
    const appDir = path.resolve(process.cwd(), 'src/app');
    const files = fs.readdirSync(appDir).filter(f => f.endsWith('.ts'));

    const forbiddenTokens = [
      'Date.now(',
      'new Date()',
      'Math.random',
      'crypto',
      'document',
      'window',
      'fetch(',
      'localStorage',
      'indexedDB',
    ];

    for (const file of files) {
      const fullPath = path.join(appDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const token of forbiddenTokens) {
        assert.ok(!content.includes(token), `Forbidden token "${token}" found in src/app/${file}`);
      }

      const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const importSource = match[1];
        assert.ok(
          !importSource.includes('/ui') && !importSource.includes('../ui'),
          `Forbidden import from ui "${importSource}" found in src/app/${file}`
        );
      }
    }
  });
});
