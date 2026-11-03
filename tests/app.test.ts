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
  activeEvents,
  ClientState,
} from '../src/kernel/index.js';
import {
  EXERCISE_BANK,
  Exercise,
  ExerciseTaskClass,
  normalizeAnswer,
  checkAnswer,
  buildEvidenceEvent,
  selectItem,
  submitAnswer,
  serializeState,
  parseState,
  InMemoryClientStore,
} from '../src/app/index.js';
import {
  startSession,
  nextExercise,
  needsIntro,
  summarizeSession,
} from '../src/app/session.js';
import { buildProgressMap } from '../src/app/progress.js';
import {
  CURRICULUM,
  PLANNER_CONFIG,
  unitTitle,
} from '../src/app/curriculum.js';
import { GRAMMAR_PACK } from '../src/content/grammar-pack.js';
import { WORD_PACK } from '../src/content/word-pack.js';

function byId(id: string): Exercise {
  const item = EXERCISE_BANK.find((e) => e.id === id);
  if (!item) throw new Error(`No exercise with id ${id}`);
  return item;
}

const GO_UNIT = 'grammar:go-went-gone';
const PS_UNIT = 'grammar:present-simple-s';

describe('ELOS App & Exercise Logic - Milestone F3', () => {
  it('EXERCISE_BANK: grammar items first (mirroring GRAMMAR_PACK), then word-pack items', () => {
    assert.strictEqual(GRAMMAR_PACK.items.length, 88);
    assert.strictEqual(EXERCISE_BANK.length, GRAMMAR_PACK.items.length + WORD_PACK.items.length);
    assert.strictEqual(EXERCISE_BANK.length, 160);

    for (let i = 0; i < GRAMMAR_PACK.items.length; i++) {
      const item = GRAMMAR_PACK.items[i];
      const ex = EXERCISE_BANK[i];
      assert.strictEqual(ex.id, item.id);
      assert.strictEqual(ex.unit_id, item.unit_id);
      assert.strictEqual(ex.task_class, item.task_class);
      assert.strictEqual(ex.context_id, item.context_id);
      assert.strictEqual(ex.prompt, item.prompt);
      assert.deepStrictEqual(ex.options, item.options);
      assert.strictEqual(ex.answer, item.answer);
      assert.deepStrictEqual(ex.accepted, item.accepted);
      assert.strictEqual(ex.note_en, item.note_en);
    }

    // Bank ids are unique; recognition answers are inside their options.
    const ids = EXERCISE_BANK.map((e) => e.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    for (const ex of EXERCISE_BANK) {
      if (ex.task_class === 'recognition_item') {
        assert.ok(ex.options, `Exercise ${ex.id} must have options`);
        assert.ok(ex.options!.includes(ex.answer), `Exercise ${ex.id} answer must be in options`);
      } else {
        assert.strictEqual(ex.options, undefined, `Exercise ${ex.id} must have no options`);
      }
    }

    // The original go/went/gone items are present and unchanged.
    assert.deepStrictEqual(
      EXERCISE_BANK.filter((e) => e.unit_id === GO_UNIT).map((e) => e.id),
      ['r1', 'r2', 'r3', 'r4', 'c1', 'c2', 'c3', 'c4']
    );
  });

  it('normalizeAnswer: case, trim, curly apostrophe (U+2019), collapsed double spaces, one trailing period', () => {
    assert.strictEqual(normalizeAnswer('  GONE. '), 'gone');
    assert.strictEqual(normalizeAnswer('She   drinks   tea'), 'she drinks tea');
    assert.strictEqual(normalizeAnswer('can\u2019t'), "can't");
    assert.strictEqual(normalizeAnswer('  It\u2019S  Raining. '), "it's raining");
    assert.strictEqual(normalizeAnswer('no article.'), 'no article');
    assert.strictEqual(normalizeAnswer('should   NOT'), 'should not');
  });

  it('checkAnswer: accepted answers ("cant", "should not"), curly apostrophes, double spaces, trailing period', () => {
    const md5 = byId('md-5'); // answer "can't", accepted ["cant", "cannot"]
    assert.strictEqual(checkAnswer(md5, "can't"), true);
    assert.strictEqual(checkAnswer(md5, 'cant'), true);
    assert.strictEqual(checkAnswer(md5, 'cannot'), true);
    assert.strictEqual(checkAnswer(md5, 'CAN\u2019T.'), true);
    assert.strictEqual(checkAnswer(md5, '  Cant. '), true);
    assert.strictEqual(checkAnswer(md5, 'can'), false);

    const md8 = byId('md-8'); // answer "shouldn't", accepted ["shouldnt", "should not"]
    assert.strictEqual(checkAnswer(md8, "shouldn't"), true);
    assert.strictEqual(checkAnswer(md8, 'shouldnt'), true);
    assert.strictEqual(checkAnswer(md8, 'should not'), true);
    assert.strictEqual(checkAnswer(md8, 'Should  Not.'), true);
    assert.strictEqual(checkAnswer(md8, 'should'), false);

    const aan3 = byId('aan-3'); // answer "an", note_en present
    assert.strictEqual(checkAnswer(aan3, 'AN'), true);
    assert.strictEqual(aan3.note_en, 'Hour starts with a vowel sound (the h is silent), so we use an.');
  });

  it('buildEvidenceEvent output passes validateEvent for each class and sets modality/task_class/context_id/evaluator as specified; deterministic with a fake clock and fake id generator', () => {
    let tick = 0;
    const fakeCtx = {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => `test-ev-${++tick}`,
    };

    const rItem = byId('r1'); // recognition_item, go/went/gone
    const evRec = buildEvidenceEvent(rItem, 'gone', fakeCtx);
    const valRec = validateEvent(evRec);
    assert.strictEqual(valRec.ok, true);
    assert.strictEqual(evRec.event_id, 'test-ev-1');
    assert.strictEqual(evRec.payload_type, 'item_response');
    assert.strictEqual(evRec.payload_version, 1);
    assert.deepStrictEqual(evRec.payload, { item_id: 'r1', response: 'gone' });
    assert.deepStrictEqual(evRec.unit_refs, [GO_UNIT]);
    assert.strictEqual(evRec.skill, 'grammar');
    assert.strictEqual(evRec.modality, 'receptive_written');
    assert.strictEqual(evRec.task_class, 'recognition_item');
    assert.strictEqual(evRec.context_id, 'home');
    assert.deepStrictEqual(evRec.evaluator, { type: 'deterministic', id: 'closed_item', version: '1' });
    assert.strictEqual(evRec.reliability, 'usable');
    assert.strictEqual(evRec.result, 'correct');
    assert.strictEqual(evRec.occurred_at, '2026-01-01T10:00:00.000Z');
    assert.strictEqual(evRec.recorded_at, '2026-01-01T10:00:00.000Z');

    const cItem = byId('c1'); // controlled_recall, go/went/gone
    const evRecall = buildEvidenceEvent(cItem, 'wrong_answer', fakeCtx);
    const valRecall = validateEvent(evRecall);
    assert.strictEqual(valRecall.ok, true);
    assert.strictEqual(evRecall.event_id, 'test-ev-2');
    assert.strictEqual(evRecall.modality, 'productive_written');
    assert.strictEqual(evRecall.task_class, 'controlled_recall');
    assert.strictEqual(evRecall.context_id, 'out');
    assert.strictEqual(evRecall.result, 'incorrect');
  });

  it('submitAnswer: a correct recognition answer on an empty client yields "exposure"; a second yields "recognition"; then a correct controlled_recall yields "controlled"; incorrect answers never advance; unsyncedCount grows', () => {
    let timeMs = 1767264000000;
    let idSeq = 0;
    const ctx = {
      now: () => new Date(timeMs++).toISOString(),
      newId: () => `ev-${++idSeq}`,
    };

    let client = createClient('dev-test');
    const config = { minDelayMs: 60000 };

    assert.strictEqual(deriveFromClient(client, GO_UNIT, config).state, 'unknown');
    assert.strictEqual(unsyncedCount(client), 0);

    const res1 = submitAnswer(client, byId('r1'), 'gone', ctx);
    assert.strictEqual(res1.correct, true);
    client = res1.state;
    assert.strictEqual(deriveFromClient(client, GO_UNIT, config).state, 'exposure');
    assert.strictEqual(unsyncedCount(client), 1);
    assert.ok(client.outbox.includes(res1.event.event_id));

    const res2 = submitAnswer(client, byId('r2'), 'went', ctx);
    assert.strictEqual(res2.correct, true);
    client = res2.state;
    assert.strictEqual(deriveFromClient(client, GO_UNIT, config).state, 'recognition');
    assert.strictEqual(unsyncedCount(client), 2);

    const res3 = submitAnswer(client, byId('c1'), 'gone', ctx);
    assert.strictEqual(res3.correct, true);
    client = res3.state;
    assert.strictEqual(deriveFromClient(client, GO_UNIT, config).state, 'controlled');
    assert.strictEqual(unsyncedCount(client), 3);

    const resIncorrect = submitAnswer(client, byId('c2'), 'wrong', ctx);
    assert.strictEqual(resIncorrect.correct, false);
    client = resIncorrect.state;
    assert.strictEqual(deriveFromClient(client, GO_UNIT, config).state, 'controlled');
    assert.strictEqual(unsyncedCount(client), 4);

    let exposureClient = createClient('dev-exp');
    exposureClient = submitAnswer(exposureClient, byId('r1'), 'gone', ctx).state;
    assert.strictEqual(deriveFromClient(exposureClient, GO_UNIT, config).state, 'exposure');
    const resWrongOnExposure = submitAnswer(exposureClient, byId('r2'), 'wrong', ctx);
    assert.strictEqual(resWrongOnExposure.correct, false);
    assert.strictEqual(deriveFromClient(resWrongOnExposure.state, GO_UNIT, config).state, 'exposure');
    assert.strictEqual(unsyncedCount(resWrongOnExposure.state), 2);
  });

  it('selectItem: least answered first, ties by bank order, never returns lastItemId when another candidate exists, counts every active event', () => {
    const client = createClient('dev-select');

    let idSeq = 0;
    const ctx = {
      now: () => '2026-01-01T10:00:00.000Z',
      newId: () => `select-ev-${++idSeq}`,
    };

    // Empty events: first recognition item of go/went/gone by bank order.
    const pick1 = selectItem(EXERCISE_BANK, GO_UNIT, 'recognition_item', [], null);
    assert.strictEqual(pick1.id, 'r1');

    // Deterministic repeats.
    assert.deepStrictEqual(
      selectItem(EXERCISE_BANK, GO_UNIT, 'recognition_item', [], null),
      pick1
    );

    // lastItemId exclusion when other candidates exist.
    const recognitionIds = ['r1', 'r2', 'r3', 'r4'];
    for (const id of recognitionIds) {
      const picked = selectItem(EXERCISE_BANK, GO_UNIT, 'recognition_item', [], id);
      assert.notStrictEqual(picked.id, id);
    }

    // Answer c1 once: the next recall pick is c2 (least answered).
    const answered = submitAnswer(client, byId('c1'), 'gone', ctx);
    const events = activeEvents(answered.state);
    const pickRecall = selectItem(EXERCISE_BANK, GO_UNIT, 'controlled_recall', events, null);
    assert.strictEqual(pickRecall.id, 'c2');

    // lastItemId exclusion inside the recall class too.
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      const picked = selectItem(EXERCISE_BANK, GO_UNIT, 'controlled_recall', events, id);
      assert.notStrictEqual(picked.id, id);
    }

    // Throws for a unit/class combination that does not exist.
    assert.throws(() =>
      selectItem(EXERCISE_BANK, GO_UNIT, 'guided_production' as ExerciseTaskClass, [], null)
    );
  });

  it('startSession on an empty client returns tasks only for grammar:present-simple-s with task_class recognition_item and at most max_items_per_unit tasks', () => {
    const client = createClient('dev-plan-empty');
    const nowIso = '2026-01-01T10:00:00Z';

    const tasks = startSession(client, nowIso, 10);
    assert.ok(tasks.length > 0);
    assert.ok(tasks.length <= PLANNER_CONFIG.max_items_per_unit);
    assert.ok(tasks.every((t) => t.unit_id === PS_UNIT));
    assert.ok(tasks.every((t) => t.task_class === 'recognition_item'));
    assert.ok(tasks.every((t) => t.tier === 'new_unit'));
    assert.ok(tasks.every((t) => t.reason === 'prerequisites satisfied'));
  });

  it('after correct answers move grammar:present-simple-s to "exposure" and "recognition", the next session contains it as "continue" with controlled_recall', () => {
    let timeMs = 1767264000000;
    let idSeq = 0;
    const ctx = {
      now: () => new Date(timeMs++).toISOString(),
      newId: () => `cont-ev-${++idSeq}`,
    };

    let client = createClient('dev-plan-continue');

    client = submitAnswer(client, byId('ps-1'), 'goes', ctx).state;
    assert.strictEqual(
      deriveFromClient(client, PS_UNIT, PLANNER_CONFIG.derive).state,
      'exposure'
    );
    client = submitAnswer(client, byId('ps-2'), 'studies', ctx).state;
    assert.strictEqual(
      deriveFromClient(client, PS_UNIT, PLANNER_CONFIG.derive).state,
      'recognition'
    );

    // One minute after the events: the unit's review is not due yet
    // (first step is 1 day), so it can only appear as "continue".
    const nowIso = new Date(timeMs + 60000).toISOString();
    const tasks = startSession(client, nowIso, 10);

    const psTasks = tasks.filter((t) => t.unit_id === PS_UNIT);
    assert.ok(psTasks.length > 0, 'expected present-simple-s tasks');
    assert.ok(psTasks.every((t) => t.tier === 'continue'));
    assert.ok(psTasks.every((t) => t.task_class === 'controlled_recall'));
    assert.ok(psTasks.every((t) => t.reason === 'state=recognition'));

    // nextExercise now returns a controlled_recall exercise of that unit.
    const exercise = nextExercise(client, psTasks[0], null);
    assert.strictEqual(exercise.unit_id, PS_UNIT);
    assert.strictEqual(exercise.task_class, 'controlled_recall');
  });

  it('buildProgressMap groups by CEFR band, has no numeric score fields, and reflects derived state and due info', () => {
    const client = createClient('dev-progress');
    const nowIso = '2026-01-01T10:00:00Z';

    const emptyMap = buildProgressMap(client, nowIso);
    assert.ok(emptyMap.length > 0);
    for (const band of emptyMap) {
      assert.ok(band.units.length > 0, `band ${band.band} must have units`);
      for (const unit of band.units) {
        assert.strictEqual(unit.state, 'unknown');
        assert.deepStrictEqual(unit.due, { kind: 'not_started' });
      }
    }
    // Only bands that have units appear.
    const bandNames = emptyMap.map((b) => b.band);
    assert.ok(bandNames.includes('A1'));
    assert.ok(bandNames.includes('A2'));

    // No percentages or scores anywhere.
    const serialized = JSON.stringify(emptyMap);
    assert.ok(!serialized.includes('percent'));
    assert.ok(!serialized.includes('score'));
    assert.ok(!/"\d+(\.\d+)?"/.test(serialized.replace(/"in_ms":\d+/g, 'IN_MS')));

    // After one correct answer the unit is "exposure" with a future review.
    let timeMs = 1767264000000;
    let idSeq = 0;
    const ctx = {
      now: () => new Date(timeMs++).toISOString(),
      newId: () => `prog-ev-${++idSeq}`,
    };
    let answeredClient = createClient('dev-progress-2');
    answeredClient = submitAnswer(answeredClient, byId('ps-1'), 'goes', ctx).state;

    const afterMap = buildProgressMap(answeredClient, new Date(timeMs).toISOString());
    const psBand = afterMap.find((b) =>
      b.units.some((u) => u.unit_id === PS_UNIT)
    )!;
    const psUnit = psBand.units.find((u) => u.unit_id === PS_UNIT)!;
    assert.strictEqual(psUnit.state, 'exposure');
    assert.strictEqual(psUnit.due.kind, 'later');
    assert.ok(psUnit.due.kind === 'later' && psUnit.due.in_ms > 0);
    assert.ok(psUnit.due.kind === 'later' && psUnit.due.in_ms <= 86400000);
  });

  it('needsIntro: true only for an unknown unit not shown yet in this session', () => {
    let timeMs = 1767264000000;
    let idSeq = 0;
    const ctx = {
      now: () => new Date(timeMs++).toISOString(),
      newId: () => `intro-ev-${++idSeq}`,
    };

    const client = createClient('dev-intro');
    assert.strictEqual(needsIntro(client, PS_UNIT, []), true);
    assert.strictEqual(needsIntro(client, PS_UNIT, [PS_UNIT]), false);

    const answered = submitAnswer(client, byId('ps-1'), 'goes', ctx).state;
    assert.strictEqual(needsIntro(answered, PS_UNIT, []), false);
  });

  it('summarizeSession: one row per unit in afterSummaries with from/to states and the next review', () => {
    const before = [
      { unit_id: 'unit-a', state: 'unknown' as const, due_at: null },
      { unit_id: 'unit-b', state: 'exposure' as const, due_at: '2026-01-02T10:00:00Z' },
    ];
    const after = [
      { unit_id: 'unit-b', state: 'recognition' as const, due_at: '2026-01-04T10:00:00Z' },
      { unit_id: 'unit-c', state: 'exposure' as const, due_at: null },
    ];

    assert.deepStrictEqual(summarizeSession(before, after), [
      { unit_id: 'unit-b', from: 'exposure', to: 'recognition', due_at: '2026-01-04T10:00:00Z' },
      { unit_id: 'unit-c', from: 'unknown', to: 'exposure', due_at: null },
    ]);

    assert.deepStrictEqual(summarizeSession(before, []), []);
  });

  it('storage: serialize/parse round trip equals the original state; parse of garbage, of "{}", of a state with a wrong field type returns corrupt without throwing; InMemoryClientStore contract (empty -> save -> ok)', async () => {
    let client = createClient('dev-storage');
    client = submitAnswer(client, byId('r1'), 'gone', {
      now: () => '2026-01-01T10:00:00Z',
      newId: () => 'ev-storage-1',
    }).state;

    const serialized = serializeState(client);
    const parsed = parseState(serialized);
    assert.strictEqual(parsed.status, 'ok');
    if (parsed.status === 'ok') {
      assert.deepStrictEqual(parsed.state, client);
    }

    const badJson = parseState('not-json{{{');
    assert.strictEqual(badJson.status, 'corrupt');
    if (badJson.status === 'corrupt') {
      assert.strictEqual(badJson.raw, 'not-json{{{');
    }

    assert.strictEqual(parseState('{}').status, 'corrupt');

    const badStateJson = JSON.stringify({ ...client, cursor: 'invalid-cursor' });
    assert.strictEqual(parseState(badStateJson).status, 'corrupt');

    const memStore = new InMemoryClientStore();
    const load1 = await memStore.load();
    assert.deepStrictEqual(load1, { status: 'empty' });

    await memStore.save(client);
    const load2 = await memStore.load();
    assert.strictEqual(load2.status, 'ok');
    if (load2.status === 'ok') {
      assert.deepStrictEqual(load2.state, client);
    }
  });

  it('parseState returns "corrupt" without throwing for each of: "null", "[]", "5", a state missing outbox, a state with non-integer device_seq in an event, events not an array, conflicts with a wrong item type, next_device_seq 0, and a negative cursor', () => {
    const baseClient = createClient('dev-corrupt-check');
    const validState = JSON.parse(serializeState(baseClient));

    assert.strictEqual(parseState('null').status, 'corrupt');
    assert.strictEqual(parseState('[]').status, 'corrupt');
    assert.strictEqual(parseState('5').status, 'corrupt');

    const missingOutbox = { ...validState };
    delete missingOutbox.outbox;
    assert.strictEqual(parseState(JSON.stringify(missingOutbox)).status, 'corrupt');

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

    const eventsNotArray = { ...validState, events: 'not-an-array' };
    assert.strictEqual(parseState(JSON.stringify(eventsNotArray)).status, 'corrupt');

    const badConflicts = { ...validState, conflicts: ['not-an-object'] };
    assert.strictEqual(parseState(JSON.stringify(badConflicts)).status, 'corrupt');

    const seqZero = { ...validState, next_device_seq: 0 };
    assert.strictEqual(parseState(JSON.stringify(seqZero)).status, 'corrupt');

    const negCursor = { ...validState, cursor: -1 };
    assert.strictEqual(parseState(JSON.stringify(negCursor)).status, 'corrupt');
  });

  it('submitAnswer throws when recordLocalEvent does not return "recorded" (for example a repeated event id with identical content)', () => {
    const client = createClient('dev-submit-check');
    const r1 = byId('r1');
    const fixedCtx = {
      now: () => '2026-01-01T10:00:00Z',
      newId: () => 'fixed-id-duplicate',
    };

    const firstSubmit = submitAnswer(client, r1, 'gone', fixedCtx);
    assert.strictEqual(firstSubmit.correct, true);

    assert.throws(
      () => {
        submitAnswer(firstSubmit.state, r1, 'gone', fixedCtx);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.includes('Failed to record event');
      }
    );
  });

  it('curriculum: grammar and words interleaved (order = array index); unitTitle falls back to the id', () => {
    assert.strictEqual(CURRICULUM.length, GRAMMAR_PACK.units.length + WORD_PACK.units.length);
    assert.strictEqual(CURRICULUM.length, 35);
    // Grammar units on the even slots in pack order, words on the odd slots
    // (after the grammar pack runs out, the remaining words fill sequentially).
    for (let i = 0; i < GRAMMAR_PACK.units.length; i++) {
      assert.strictEqual(CURRICULUM[2 * i].id, GRAMMAR_PACK.units[i].id);
      assert.strictEqual(CURRICULUM[2 * i].cefr, GRAMMAR_PACK.units[i].cefr);
      assert.deepStrictEqual(CURRICULUM[2 * i].prerequisites, GRAMMAR_PACK.units[i].prerequisites);
    }
    for (let i = 0; i < WORD_PACK.units.length; i++) {
      const wordIndex = i < GRAMMAR_PACK.units.length ? 2 * i + 1 : i + GRAMMAR_PACK.units.length;
      assert.strictEqual(CURRICULUM[wordIndex].id, WORD_PACK.units[i].id);
    }
    for (let i = 0; i < CURRICULUM.length; i++) {
      assert.strictEqual(CURRICULUM[i].order, i);
    }
    assert.strictEqual(unitTitle(PS_UNIT), 'Present simple: he/she/it + -s');
    assert.strictEqual(unitTitle('word:book'), 'Word: book');
    assert.strictEqual(unitTitle('grammar:not-a-unit'), 'grammar:not-a-unit');
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
