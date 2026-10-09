import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  validateEvent,
  classifyIncoming,
  compareEvents,
  deriveUnitState,
  EvidenceEvent,
  DeriveUnitStateConfig,
} from '../src/kernel/index.js';

function makeBaseEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    event_id: 'evt-1',
    payload_type: 'item_response',
    payload_version: 1,
    occurred_at: '2026-01-01T10:00:00Z',
    recorded_at: '2026-01-01T10:00:01Z',
    unit_refs: ['unit-101'],
    skill: 'vocabulary',
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
      item_id: 'item-vocab-1',
      response: 'cat',
    },
    ...overrides,
  };
}

const defaultConfig: DeriveUnitStateConfig = {
  minDelayMs: 60000, // 1 minute
};

describe('ELOS Evidence Kernel - Milestone A', () => {
  it('order invariance: a set of 5 events including a duplicate and a correction gives identical derived state for all 120 permutations', () => {
    const e1 = makeBaseEvent({
      event_id: 'evt-base-1',
      occurred_at: '2026-01-01T10:00:00Z',
      recorded_at: '2026-01-01T10:00:01Z',
      task_class: 'recognition_item',
      result: 'correct',
    });

    const e2 = makeBaseEvent({
      event_id: 'evt-flawed-2',
      occurred_at: '2026-01-01T11:00:00Z',
      recorded_at: '2026-01-01T11:00:01Z',
      task_class: 'controlled_recall',
      result: 'incorrect',
    });

    const e3 = makeBaseEvent({
      event_id: 'evt-correction-3',
      corrects_event_id: 'evt-flawed-2',
      occurred_at: '2026-01-01T11:00:00Z',
      recorded_at: '2026-01-01T11:05:00Z',
      task_class: 'controlled_recall',
      result: 'correct',
    });

    const e4Duplicate = makeBaseEvent({
      event_id: 'evt-base-1',
      occurred_at: '2026-01-01T10:00:00Z',
      recorded_at: '2026-01-01T10:00:01Z',
      task_class: 'recognition_item',
      result: 'correct',
    });

    const e5 = makeBaseEvent({
      event_id: 'evt-guided-5',
      occurred_at: '2026-01-01T12:00:00Z',
      recorded_at: '2026-01-01T12:00:01Z',
      task_class: 'guided_production',
      result: 'correct',
    });

    const events = [e1, e2, e3, e4Duplicate, e5];

    function permute<T>(arr: T[]): T[][] {
      if (arr.length <= 1) return [arr];
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        const subPerms = permute(remaining);
        for (const sp of subPerms) {
          result.push([current, ...sp]);
        }
      }
      return result;
    }

    const permutations = permute(events);
    assert.strictEqual(permutations.length, 120);

    const baseline = deriveUnitState('unit-101', permutations[0], defaultConfig);

    for (let i = 1; i < permutations.length; i++) {
      const derived = deriveUnitState('unit-101', permutations[i], defaultConfig);
      assert.deepStrictEqual(
        derived,
        baseline,
        `Permutation ${i} produced a different derived state`
      );
    }
  });

  it('repeated incorrect events of many classes never advance state', () => {
    const e1 = makeBaseEvent({
      event_id: 'evt-inc-1',
      occurred_at: '2026-01-01T10:00:00Z',
      task_class: 'recognition_item',
      result: 'incorrect',
    });
    const e2 = makeBaseEvent({
      event_id: 'evt-inc-2',
      occurred_at: '2026-01-01T10:10:00Z',
      task_class: 'controlled_recall',
      result: 'incorrect',
    });
    const e3 = makeBaseEvent({
      event_id: 'evt-inc-3',
      occurred_at: '2026-01-01T10:20:00Z',
      task_class: 'guided_production',
      result: 'incorrect',
    });
    const e4 = makeBaseEvent({
      event_id: 'evt-inc-4',
      occurred_at: '2026-01-01T10:30:00Z',
      task_class: 'independent_production',
      result: 'incorrect',
    });

    const res1 = deriveUnitState('unit-101', [e1], defaultConfig);
    assert.strictEqual(res1.state, 'exposure');

    const resAll = deriveUnitState('unit-101', [e1, e2, e3, e4], defaultConfig);
    assert.strictEqual(resAll.state, 'exposure');
    assert.strictEqual(resAll.usableEventCount, 4);
  });

  it('not_assessable, unusable and low-reliability events never advance and never weaken', () => {
    const unusableEvt = makeBaseEvent({
      event_id: 'evt-unusable',
      occurred_at: '2026-01-01T10:00:00Z',
      reliability: 'unusable',
      result: 'not_assessable',
    });

    const lowEvt = makeBaseEvent({
      event_id: 'evt-low',
      occurred_at: '2026-01-01T10:10:00Z',
      reliability: 'low',
      result: 'correct',
    });

    const notAssessableEvt = makeBaseEvent({
      event_id: 'evt-na',
      occurred_at: '2026-01-01T10:20:00Z',
      reliability: 'usable',
      result: 'not_assessable',
    });

    const fromUnknown = deriveUnitState(
      'unit-101',
      [unusableEvt, lowEvt, notAssessableEvt],
      defaultConfig
    );
    assert.strictEqual(fromUnknown.state, 'unknown');
    assert.strictEqual(fromUnknown.usableEventCount, 0);
    assert.strictEqual(fromUnknown.confidence, 'normal');

    const validAdvance1 = makeBaseEvent({
      event_id: 'evt-adv-1',
      occurred_at: '2026-01-01T11:00:00Z',
      task_class: 'recognition_item',
      result: 'correct',
    });
    const validAdvance2 = makeBaseEvent({
      event_id: 'evt-adv-2',
      occurred_at: '2026-01-01T11:05:00Z',
      task_class: 'recognition_item',
      result: 'correct',
    });

    const lowIncorrect = makeBaseEvent({
      event_id: 'evt-low-inc',
      occurred_at: '2026-01-01T11:10:00Z',
      reliability: 'low',
      result: 'incorrect',
    });

    const resAdvanced = deriveUnitState(
      'unit-101',
      [validAdvance1, validAdvance2, lowIncorrect],
      defaultConfig
    );
    assert.strictEqual(resAdvanced.state, 'recognition');
    assert.strictEqual(resAdvanced.confidence, 'normal');
    assert.strictEqual(resAdvanced.recheckRecommended, false);
  });

  it('one step per event even when many correct events of higher classes exist', () => {
    const e1 = makeBaseEvent({
      event_id: 'evt-step-1',
      occurred_at: '2026-01-01T10:00:00Z',
      task_class: 'independent_production',
      result: 'correct',
    });
    const s1 = deriveUnitState('unit-101', [e1], defaultConfig);
    assert.strictEqual(s1.state, 'exposure');

    const e2 = makeBaseEvent({
      event_id: 'evt-step-2',
      occurred_at: '2026-01-01T10:05:00Z',
      task_class: 'independent_production',
      result: 'correct',
    });
    const s2 = deriveUnitState('unit-101', [e1, e2], defaultConfig);
    assert.strictEqual(s2.state, 'recognition');

    const e3 = makeBaseEvent({
      event_id: 'evt-step-3',
      occurred_at: '2026-01-01T10:10:00Z',
      task_class: 'independent_production',
      result: 'correct',
    });
    const s3 = deriveUnitState('unit-101', [e1, e2, e3], defaultConfig);
    assert.strictEqual(s3.state, 'controlled');

    const e4 = makeBaseEvent({
      event_id: 'evt-step-4',
      occurred_at: '2026-01-01T10:15:00Z',
      task_class: 'independent_production',
      result: 'correct',
    });
    const s4 = deriveUnitState('unit-101', [e1, e2, e3, e4], defaultConfig);
    assert.strictEqual(s4.state, 'guided');

    const e5 = makeBaseEvent({
      event_id: 'evt-step-5',
      occurred_at: '2026-01-01T10:20:00Z',
      task_class: 'independent_production',
      result: 'correct',
    });
    const s5 = deriveUnitState('unit-101', [e1, e2, e3, e4, e5], defaultConfig);
    assert.strictEqual(s5.state, 'spontaneous');
  });

  it('full ladder exposure -> mastery on a valid sequence; mastery blocked when Q events are only llm/owner evaluated, when no event meets minDelayMs, or when only one context_id exists', () => {
    const e1 = makeBaseEvent({
      event_id: 'e1',
      occurred_at: '2026-01-01T10:00:00Z',
      task_class: 'recognition_item',
      result: 'correct',
    });
    const e2 = makeBaseEvent({
      event_id: 'e2',
      occurred_at: '2026-01-01T10:05:00Z',
      task_class: 'recognition_item',
      result: 'correct',
    });
    const e3 = makeBaseEvent({
      event_id: 'e3',
      occurred_at: '2026-01-01T10:10:00Z',
      task_class: 'controlled_recall',
      result: 'correct',
    });
    const e4 = makeBaseEvent({
      event_id: 'e4',
      occurred_at: '2026-01-01T10:15:00Z',
      task_class: 'guided_production',
      result: 'correct',
    });
    const e5 = makeBaseEvent({
      event_id: 'e5',
      occurred_at: '2026-01-01T10:20:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-alpha',
      evaluator: { type: 'human', id: 'teacher-1', version: '1' },
      result: 'correct',
    });
    const e6 = makeBaseEvent({
      event_id: 'e6',
      occurred_at: '2026-01-01T10:30:00Z', // 10 minutes later (defaultConfig minDelay is 1 min)
      task_class: 'independent_production',
      context_id: 'ctx-beta',
      evaluator: { type: 'deterministic', id: 'system-eval', version: '1' },
      result: 'correct',
    });

    const fullLadderRes = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, e6],
      defaultConfig
    );
    assert.strictEqual(fullLadderRes.state, 'mastery');
    assert.strictEqual(fullLadderRes.confidence, 'normal');

    // Blocked: only llm/owner evaluated
    const e5Llm = { ...e5, evaluator: { type: 'llm' as const, id: 'llm-1', version: '1' } };
    const e6Owner = { ...e6, evaluator: { type: 'owner' as const, id: 'user-1', version: '1' } };
    const blockedEvaluator = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5Llm, e6Owner],
      defaultConfig
    );
    assert.strictEqual(blockedEvaluator.state, 'spontaneous');

    // Blocked: no event meets minDelayMs
    const e5TooFast = {
      ...e5,
      occurred_at: '2026-01-01T10:15:10Z', // only 10s after e4
    };
    const e6TooFast = {
      ...e6,
      occurred_at: '2026-01-01T10:15:20Z', // only 10s after e5TooFast
    };
    const blockedDelay = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5TooFast, e6TooFast],
      defaultConfig
    );
    assert.strictEqual(blockedDelay.state, 'spontaneous');

    // Blocked: only one context_id exists in Q
    const e6SameContext = {
      ...e6,
      context_id: 'ctx-alpha', // same as e5
    };
    const blockedContext = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, e6SameContext],
      defaultConfig
    );
    assert.strictEqual(blockedContext.state, 'spontaneous');
  });

  it('R3: an incorrect event after mastery keeps state mastery, sets confidence weakened and recheckRecommended', () => {
    const validLadder = [
      makeBaseEvent({ event_id: 'm1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeBaseEvent({ event_id: 'm2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeBaseEvent({ event_id: 'm3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' }),
      makeBaseEvent({ event_id: 'm4', occurred_at: '2026-01-01T10:15:00Z', task_class: 'guided_production', result: 'correct' }),
      makeBaseEvent({ event_id: 'm5', occurred_at: '2026-01-01T10:20:00Z', task_class: 'independent_production', context_id: 'c1', evaluator: { type: 'human', id: 'h1', version: '1' }, result: 'correct' }),
      makeBaseEvent({ event_id: 'm6', occurred_at: '2026-01-01T10:30:00Z', task_class: 'independent_production', context_id: 'c2', evaluator: { type: 'deterministic', id: 'd1', version: '1' }, result: 'correct' }),
    ];

    const masteryRes = deriveUnitState('unit-101', validLadder, defaultConfig);
    assert.strictEqual(masteryRes.state, 'mastery');
    assert.strictEqual(masteryRes.confidence, 'normal');
    assert.strictEqual(masteryRes.recheckRecommended, false);

    const incorrectAfterMastery = makeBaseEvent({
      event_id: 'm7-fail',
      occurred_at: '2026-01-01T11:00:00Z',
      task_class: 'controlled_recall',
      result: 'incorrect',
    });

    const weakenedRes = deriveUnitState(
      'unit-101',
      [...validLadder, incorrectAfterMastery],
      defaultConfig
    );
    assert.strictEqual(weakenedRes.state, 'mastery');
    assert.strictEqual(weakenedRes.confidence, 'weakened');
    assert.strictEqual(weakenedRes.recheckRecommended, true);
  });

  it('validateEvent: unusable+correct is invalid; unknown payload type invalid; bad timestamp invalid; self_report by a non-owner invalid', () => {
    const base = makeBaseEvent();
    assert.strictEqual(validateEvent(base).ok, true);

    // unusable + correct is invalid
    const unusableCorrect = { ...base, reliability: 'unusable' as const, result: 'correct' as const };
    const r1 = validateEvent(unusableCorrect);
    assert.strictEqual(r1.ok, false);
    assert.ok(r1.errors?.some(e => e.includes('unusable')));

    // unknown payload type invalid
    const unknownPayload = { ...base, payload_type: 'unknown_type' };
    const r2 = validateEvent(unknownPayload);
    assert.strictEqual(r2.ok, false);
    assert.ok(r2.errors?.some(e => e.includes('Unknown payload type')));

    // bad timestamp invalid
    const badTimestamp = { ...base, occurred_at: 'not-a-timestamp' };
    const r3 = validateEvent(badTimestamp);
    assert.strictEqual(r3.ok, false);
    assert.ok(r3.errors?.some(e => e.includes('occurred_at')));

    // self_report by non-owner invalid
    const selfReportNonOwner = {
      ...base,
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'human' as const, id: 'h1', version: '1' },
      payload: { claim: 'know' },
    };
    const r4 = validateEvent(selfReportNonOwner);
    assert.strictEqual(r4.ok, false);
    assert.ok(r4.errors?.some(e => e.includes('owner')));

    // self_report by owner is valid
    const selfReportOwner = {
      ...base,
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner' as const, id: 'owner-me', version: '1' },
      payload: { claim: 'dont_know' },
    };
    assert.strictEqual(validateEvent(selfReportOwner).ok, true);
  });

  it('classifyIncoming returns opaque for an unknown payload_type, and deriveUnitState ignores opaque events', () => {
    const base = makeBaseEvent();
    assert.strictEqual(classifyIncoming(base), 'valid');

    const opaqueEvt = {
      ...base,
      payload_type: 'audio_waveform',
      payload_version: 1,
      payload: { sampleRate: 44100 },
    };
    assert.strictEqual(classifyIncoming(opaqueEvt), 'opaque');

    const invalidEvt = {
      ...base,
      occurred_at: 'invalid-time',
    };
    assert.strictEqual(classifyIncoming(invalidEvt), 'invalid');

    // deriveUnitState ignores opaque events
    const res = deriveUnitState('unit-101', [opaqueEvt], defaultConfig);
    assert.strictEqual(res.state, 'unknown');
    assert.strictEqual(res.usableEventCount, 0);
  });

  it('same event_id with different content appears in conflicts', () => {
    const eA = makeBaseEvent({
      event_id: 'conflict-id',
      occurred_at: '2026-01-01T10:00:00Z',
      result: 'correct',
    });
    const eB = makeBaseEvent({
      event_id: 'conflict-id',
      occurred_at: '2026-01-01T10:00:00Z',
      result: 'incorrect',
    });

    const res = deriveUnitState('unit-101', [eA, eB], defaultConfig);
    assert.ok(res.conflicts.includes('conflict-id'));
    assert.strictEqual(res.conflicts.length, 1);
  });

  it('corrects_event_id excludes the corrected event', () => {
    const initialIncorrect = makeBaseEvent({
      event_id: 'orig-evt',
      occurred_at: '2026-01-01T10:00:00Z',
      result: 'incorrect',
    });
    const correctionEvent = makeBaseEvent({
      event_id: 'corr-evt',
      corrects_event_id: 'orig-evt',
      occurred_at: '2026-01-01T10:05:00Z',
      result: 'correct',
    });

    const res = deriveUnitState(
      'unit-101',
      [initialIncorrect, correctionEvent],
      defaultConfig
    );
    // orig-evt was excluded, so only corr-evt was replayed
    assert.strictEqual(res.usableEventCount, 1);
    assert.strictEqual(res.state, 'exposure');
    assert.strictEqual(res.confidence, 'normal');
  });

  it('Sequence that reaches "spontaneous" with Q already satisfied: a following correct recognition_item event leaves state "spontaneous"; a following qualifying independent_production event (deterministic evaluator) gives "mastery"', () => {
    const e1 = makeBaseEvent({ event_id: 'q-seq-1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' });
    const e2 = makeBaseEvent({ event_id: 'q-seq-2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' });
    const e3 = makeBaseEvent({ event_id: 'q-seq-3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' });
    // e4 advances controlled -> guided, and is in Q (ctx-1, human)
    const e4 = makeBaseEvent({
      event_id: 'q-seq-4',
      occurred_at: '2026-01-01T10:15:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-1',
      evaluator: { type: 'human', id: 'h1', version: '1' },
      result: 'correct',
    });
    // e5 advances guided -> spontaneous (one step), and is in Q (ctx-2, deterministic, delay >= minDelayMs after e4)
    const e5 = makeBaseEvent({
      event_id: 'q-seq-5',
      occurred_at: '2026-01-01T10:30:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-2',
      evaluator: { type: 'deterministic', id: 'd1', version: '1' },
      result: 'correct',
    });

    const reachedSpontaneous = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5],
      defaultConfig
    );
    assert.strictEqual(reachedSpontaneous.state, 'spontaneous');

    // A following correct recognition_item event leaves state "spontaneous"
    const e6Recognition = makeBaseEvent({
      event_id: 'q-seq-6',
      occurred_at: '2026-01-01T10:35:00Z',
      task_class: 'recognition_item',
      result: 'correct',
    });
    const afterRecognition = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, e6Recognition],
      defaultConfig
    );
    assert.strictEqual(afterRecognition.state, 'spontaneous');

    // A following qualifying independent_production event (deterministic evaluator) gives "mastery"
    const e7Independent = makeBaseEvent({
      event_id: 'q-seq-7',
      occurred_at: '2026-01-01T10:40:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-3',
      evaluator: { type: 'deterministic', id: 'd2', version: '1' },
      result: 'correct',
    });
    const afterIndependent = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, e6Recognition, e7Independent],
      defaultConfig
    );
    assert.strictEqual(afterIndependent.state, 'mastery');
  });

  it('After mastery, an incorrect event gives confidence "weakened"; a later owner self_report ("know") leaves confidence "weakened" and recheckRecommended true', () => {
    const validLadder = [
      makeBaseEvent({ event_id: 'm1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeBaseEvent({ event_id: 'm2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' }),
      makeBaseEvent({ event_id: 'm3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' }),
      makeBaseEvent({ event_id: 'm4', occurred_at: '2026-01-01T10:15:00Z', task_class: 'guided_production', result: 'correct' }),
      makeBaseEvent({ event_id: 'm5', occurred_at: '2026-01-01T10:20:00Z', task_class: 'independent_production', context_id: 'c1', evaluator: { type: 'human', id: 'h1', version: '1' }, result: 'correct' }),
      makeBaseEvent({ event_id: 'm6', occurred_at: '2026-01-01T10:30:00Z', task_class: 'independent_production', context_id: 'c2', evaluator: { type: 'deterministic', id: 'd1', version: '1' }, result: 'correct' }),
    ];

    const incorrectEvent = makeBaseEvent({
      event_id: 'm7-fail',
      occurred_at: '2026-01-01T11:00:00Z',
      task_class: 'controlled_recall',
      result: 'incorrect',
    });

    const ownerSelfReport = makeBaseEvent({
      event_id: 'm8-self-report',
      occurred_at: '2026-01-01T11:05:00Z',
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      payload: { claim: 'know' },
      result: 'correct',
    });

    const res = deriveUnitState(
      'unit-101',
      [...validLadder, incorrectEvent, ownerSelfReport],
      defaultConfig
    );
    assert.strictEqual(res.state, 'mastery');
    assert.strictEqual(res.confidence, 'weakened');
    assert.strictEqual(res.recheckRecommended, true);
    assert.strictEqual(res.usableEventCount, validLadder.length + 2);
  });

  it('A self_report event between two independent events does not reset the delay measurement', () => {
    const e1 = makeBaseEvent({ event_id: 'd-1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' });
    const e2 = makeBaseEvent({ event_id: 'd-2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' });
    const e3 = makeBaseEvent({ event_id: 'd-3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' });
    const e4 = makeBaseEvent({ event_id: 'd-4', occurred_at: '2026-01-01T10:15:00Z', task_class: 'guided_production', result: 'correct' });

    // e5 at 10:20:00Z reaches spontaneous
    const e5 = makeBaseEvent({
      event_id: 'd-5',
      occurred_at: '2026-01-01T10:20:00Z',
      task_class: 'independent_production',
      context_id: 'c1',
      evaluator: { type: 'human', id: 'h1', version: '1' },
      result: 'correct',
    });

    // self_report at 10:29:40Z (only 20s before e6)
    const eSelfReport = makeBaseEvent({
      event_id: 'd-sr',
      occurred_at: '2026-01-01T10:29:40Z',
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      payload: { claim: 'know' },
      result: 'correct',
    });

    // e6 at 10:30:00Z (10 minutes after e5, but only 20s after eSelfReport). minDelayMs is 60s (1m).
    const e6 = makeBaseEvent({
      event_id: 'd-6',
      occurred_at: '2026-01-01T10:30:00Z',
      task_class: 'independent_production',
      context_id: 'c2',
      evaluator: { type: 'deterministic', id: 'd1', version: '1' },
      result: 'correct',
    });

    const res = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, eSelfReport, e6],
      defaultConfig
    );
    // Because self_report does not reset the delay measurement, e6 delay is measured relative to e5 (10 mins >= 1 min)
    assert.strictEqual(res.state, 'mastery');
  });

  it('A stream of correct self_report events leaves state "unknown"', () => {
    const sr1 = makeBaseEvent({
      event_id: 'sr-1',
      occurred_at: '2026-01-01T10:00:00Z',
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      payload: { claim: 'know' },
      result: 'correct',
    });
    const sr2 = makeBaseEvent({
      event_id: 'sr-2',
      occurred_at: '2026-01-01T10:05:00Z',
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      payload: { claim: 'know' },
      result: 'correct',
    });
    const sr3 = makeBaseEvent({
      event_id: 'sr-3',
      occurred_at: '2026-01-01T10:10:00Z',
      payload_type: 'self_report',
      payload_version: 1,
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      payload: { claim: 'dont_know' },
      result: 'correct',
    });

    const res = deriveUnitState('unit-101', [sr1, sr2, sr3], defaultConfig);
    assert.strictEqual(res.state, 'unknown');
    assert.strictEqual(res.usableEventCount, 3);
    assert.strictEqual(res.confidence, 'normal');
    assert.strictEqual(res.selfReportedUnknown, true);
  });

  it('A self-correcting event is invalid in validateEvent and in classifyIncoming', () => {
    const selfCorrecting = makeBaseEvent({
      event_id: 'evt-self-correct',
      corrects_event_id: 'evt-self-correct',
    });

    const vRes = validateEvent(selfCorrecting);
    assert.strictEqual(vRes.ok, false);
    assert.ok(vRes.errors?.some(e => e.includes('corrects_event_id')));

    const cRes = classifyIncoming(selfCorrecting);
    assert.strictEqual(cRes, 'invalid');
  });

  it('An earlier LLM-evaluated or owner-evaluated independent_production event that supplies the second context_id or the delay must NOT count toward mastery when the other qualifying events are insufficient on their own', () => {
    const e1 = makeBaseEvent({ event_id: 'q-llm-1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' });
    const e2 = makeBaseEvent({ event_id: 'q-llm-2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' });
    const e3 = makeBaseEvent({ event_id: 'q-llm-3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' });
    const e4 = makeBaseEvent({ event_id: 'q-llm-4', occurred_at: '2026-01-01T10:15:00Z', task_class: 'guided_production', result: 'correct' });

    // Earlier LLM event with context_id 'ctx-llm'
    const eLlmEarlier = makeBaseEvent({
      event_id: 'q-llm-early',
      occurred_at: '2026-01-01T10:20:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-llm',
      evaluator: { type: 'llm', id: 'llm-eval', version: '1.0' },
      result: 'correct',
    });

    // Qualifying deterministic event with context_id 'ctx-qual-1', delay 10m >= 1m
    const eQual1 = makeBaseEvent({
      event_id: 'q-qual-1',
      occurred_at: '2026-01-01T10:30:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-qual-1',
      evaluator: { type: 'deterministic', id: 'det-eval', version: '1.0' },
      result: 'correct',
    });

    const resContext = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, eLlmEarlier, eQual1],
      defaultConfig
    );
    assert.strictEqual(resContext.state, 'spontaneous');

    // Also test owner-evaluated supplying delay:
    // Qualifying events qualA (ctx-A) and qualB (ctx-B) are only 10s apart, while earlier owner event was 10m earlier.
    const eOwnerEarly = makeBaseEvent({
      event_id: 'q-owner-early',
      occurred_at: '2026-01-01T10:00:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-owner',
      evaluator: { type: 'owner', id: 'owner-user', version: '1.0' },
      result: 'correct',
    });
    const eQualA = makeBaseEvent({
      event_id: 'q-qual-a',
      occurred_at: '2026-01-01T10:10:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-A',
      evaluator: { type: 'deterministic', id: 'det-eval', version: '1.0' },
      result: 'correct',
    });
    const eQualB = makeBaseEvent({
      event_id: 'q-qual-b',
      occurred_at: '2026-01-01T10:10:10Z', // only 10s after qualA (minDelay is 60s)
      task_class: 'independent_production',
      context_id: 'ctx-B',
      evaluator: { type: 'human', id: 'human-teacher', version: '1.0' },
      result: 'correct',
    });
    const resDelay = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, eOwnerEarly, eQualA, eQualB],
      defaultConfig
    );
    assert.strictEqual(resDelay.state, 'spontaneous');
  });

  it('When Q is already satisfied by earlier deterministic events, a following correct independent_production event evaluated by "llm" (or "owner") must leave state "spontaneous"', () => {
    const e1 = makeBaseEvent({ event_id: 'sat-1', occurred_at: '2026-01-01T10:00:00Z', task_class: 'recognition_item', result: 'correct' });
    const e2 = makeBaseEvent({ event_id: 'sat-2', occurred_at: '2026-01-01T10:05:00Z', task_class: 'recognition_item', result: 'correct' });
    const e3 = makeBaseEvent({ event_id: 'sat-3', occurred_at: '2026-01-01T10:10:00Z', task_class: 'controlled_recall', result: 'correct' });
    // e4 in Q (ctx-1, human)
    const e4 = makeBaseEvent({
      event_id: 'sat-4',
      occurred_at: '2026-01-01T10:15:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-1',
      evaluator: { type: 'human', id: 'h1', version: '1' },
      result: 'correct',
    });
    // e5 in Q (ctx-2, deterministic, delay 15m >= 1m). Advances guided -> spontaneous.
    const e5 = makeBaseEvent({
      event_id: 'sat-5',
      occurred_at: '2026-01-01T10:30:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-2',
      evaluator: { type: 'deterministic', id: 'd1', version: '1' },
      result: 'correct',
    });

    const reachedSpontaneous = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5],
      defaultConfig
    );
    assert.strictEqual(reachedSpontaneous.state, 'spontaneous');

    // Following correct independent_production event evaluated by "llm"
    const eLlm = makeBaseEvent({
      event_id: 'sat-6-llm',
      occurred_at: '2026-01-01T10:35:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-3',
      evaluator: { type: 'llm', id: 'llm-1', version: '1' },
      result: 'correct',
    });
    const afterLlm = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, eLlm],
      defaultConfig
    );
    assert.strictEqual(afterLlm.state, 'spontaneous');

    // Following correct independent_production event evaluated by "owner"
    const eOwner = makeBaseEvent({
      event_id: 'sat-7-owner',
      occurred_at: '2026-01-01T10:40:00Z',
      task_class: 'independent_production',
      context_id: 'ctx-4',
      evaluator: { type: 'owner', id: 'owner-1', version: '1' },
      result: 'correct',
    });
    const afterOwner = deriveUnitState(
      'unit-101',
      [e1, e2, e3, e4, e5, eOwner],
      defaultConfig
    );
    assert.strictEqual(afterOwner.state, 'spontaneous');
  });

  it('purity test: scan src/kernel files and fail on Date.now(, new Date(), Math.random, "fs", "process", "fetch(", and on any import from outside src/kernel', () => {
    const kernelDir = path.resolve(process.cwd(), 'src/kernel');
    const files = fs.readdirSync(kernelDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

    assert.ok(files.length > 0, 'No files found in src/kernel');

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

    for (const file of files) {
      const fullPath = path.join(kernelDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const token of forbiddenTokens) {
        assert.ok(
          !content.includes(token),
          `Forbidden token "${token}" found in ${file}`
        );
      }

      // Check imports: any import must be relative starting with ./ or ../ inside src/kernel
      const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const importSource = match[1];
        assert.ok(
          importSource.startsWith('./') || importSource.startsWith('../'),
          `External import "${importSource}" found in ${file}`
        );
      }
    }
  });
});
