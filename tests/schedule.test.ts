import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EvidenceEvent } from '../src/kernel/index.js';
import { ReviewConfig, deriveReviewInfo } from '../src/kernel/schedule.js';

function makeBaseEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    event_id: 'evt-1',
    payload_type: 'item_response',
    payload_version: 1,
    occurred_at: '2026-01-01T10:00:00Z',
    recorded_at: '2026-01-01T10:00:01Z',
    unit_refs: ['unit-review'],
    skill: 'grammar',
    modality: 'receptive_written',
    task_class: 'recognition_item',
    context_id: 'ctx-1',
    evaluator: {
      type: 'deterministic',
      id: 'eval-auto',
      version: '1.0.0',
    },
    reliability: 'usable',
    result: 'correct',
    payload: {
      item_id: 'item-1',
      response: 'gone',
    },
    ...overrides,
  };
}

const UNIT = 'unit-review';

const config: ReviewConfig = {
  steps_ms: [1000, 3000, 7000],
  relearn_delay_ms: 100,
};

const T0 = Date.parse('2026-01-01T10:00:00Z');
function isoAt(ms: number): string {
  return new Date(T0 + ms).toISOString();
}

describe('ELOS Review Schedule - Milestone F2', () => {
  it('first correct event gives streak 1 and due = t + steps_ms[0]', () => {
    const events = [makeBaseEvent({ occurred_at: isoAt(0) })];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
    assert.strictEqual(info.last_usable_at, isoAt(0));
  });

  it('a second correct event before due changes nothing', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(500) }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
    assert.strictEqual(info.last_usable_at, isoAt(500));
  });

  it('a correct event at or after due gives streak 2 and due = t + steps_ms[1]', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(1000) }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 2);
    assert.strictEqual(info.due_at, isoAt(4000));
  });

  it('the step index caps at the last step', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(1000) }),
      makeBaseEvent({ event_id: 'e3', occurred_at: isoAt(4000) }),
      makeBaseEvent({ event_id: 'e4', occurred_at: isoAt(11000) }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 4);
    // streak 4 exceeds steps_ms.length (3): index caps at the last step (7000).
    assert.strictEqual(info.due_at, isoAt(11000 + 7000));
  });

  it('an incorrect event gives streak 0 and due = t + relearn_delay_ms', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(2000), result: 'incorrect' }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 0);
    assert.strictEqual(info.due_at, isoAt(2000 + 100));
  });

  it('partial changes nothing', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(200), result: 'partial' }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
    assert.strictEqual(info.last_usable_at, isoAt(200));
  });

  it('self_report is ignored (no state effect, not even last_usable_at)', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({
        event_id: 'e2',
        occurred_at: isoAt(200),
        payload_type: 'self_report',
        evaluator: { type: 'owner', id: 'self', version: '1' },
        payload: { claim: 'know' },
        result: 'correct',
      }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
    assert.strictEqual(info.last_usable_at, isoAt(0));
  });

  it('not_assessable and low/unusable events are ignored', () => {
    const events = [
      makeBaseEvent({
        event_id: 'e1',
        occurred_at: isoAt(100),
        result: 'not_assessable',
        reliability: 'unusable',
      }),
      makeBaseEvent({
        event_id: 'e2',
        occurred_at: isoAt(200),
        result: 'correct',
        reliability: 'low',
      }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 0);
    assert.strictEqual(info.due_at, null);
    assert.strictEqual(info.last_usable_at, null);
  });

  it('a corrected event is excluded from the replay', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({
        event_id: 'e2',
        occurred_at: isoAt(100),
        result: 'incorrect',
      }),
      makeBaseEvent({
        event_id: 'e3',
        occurred_at: isoAt(150),
        corrects_event_id: 'e2',
        result: 'correct',
      }),
    ];
    const info = deriveReviewInfo(UNIT, events, config);
    // e2 is excluded (corrected by e3), so the replay is e1 then e3.
    // e3 (t=150) is before due (1000), so it does not advance the streak.
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
    assert.strictEqual(info.last_usable_at, isoAt(150));
  });

  it('the result is identical for every permutation of 5 events', () => {
    const events = [
      makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) }),
      makeBaseEvent({ event_id: 'e2', occurred_at: isoAt(1000) }),
      makeBaseEvent({ event_id: 'e3', occurred_at: isoAt(2000), result: 'incorrect' }),
      makeBaseEvent({ event_id: 'e4', occurred_at: isoAt(2100), result: 'partial' }),
      makeBaseEvent({ event_id: 'e5', occurred_at: isoAt(2200) }),
    ];

    function permute<T>(arr: readonly T[]): T[][] {
      if (arr.length <= 1) return [arr as T[]];
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const sp of permute(remaining)) {
          result.push([current, ...sp]);
        }
      }
      return result;
    }

    const permutations = permute(events);
    assert.strictEqual(permutations.length, 120);

    const baseline = deriveReviewInfo(UNIT, permutations[0], config);
    assert.strictEqual(baseline.streak, 1);
    assert.strictEqual(baseline.due_at, isoAt(2200 + 1000));

    for (let i = 1; i < permutations.length; i++) {
      const derived = deriveReviewInfo(UNIT, permutations[i], config);
      assert.deepStrictEqual(
        derived,
        baseline,
        `Permutation ${i} produced a different review info`
      );
    }
  });

  it('never-started units give due_at null and streak 0', () => {
    const events = [makeBaseEvent({ unit_refs: ['other-unit'] })];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 0);
    assert.strictEqual(info.last_usable_at, null);
    assert.strictEqual(info.due_at, null);
  });

  it('an identical duplicate event is deduped and does not double-count', () => {
    const base = makeBaseEvent({ event_id: 'e1', occurred_at: isoAt(0) });
    const events = [base, { ...base }];
    const info = deriveReviewInfo(UNIT, events, config);
    assert.strictEqual(info.streak, 1);
    assert.strictEqual(info.due_at, isoAt(1000));
  });
});
