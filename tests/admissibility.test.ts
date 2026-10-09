import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  assessAdmissibility,
  CandidateAssessment,
  EvaluatorApproval,
  TaskContext,
  AdmissibilityInput,
  deriveUnitState,
} from '../src/kernel/index.js';

function makeBaseCandidate(overrides: Partial<CandidateAssessment> = {}): CandidateAssessment {
  return {
    candidate_id: 'cand-1',
    evaluator: {
      type: 'llm',
      id: 'gpt-4o',
      version: '2024-05-13',
    },
    task_class: 'independent_production',
    claim_type: 'lexical_accuracy',
    unit_refs: ['unit-101'],
    skill: 'vocabulary',
    modality: 'productive_written',
    context_id: 'ctx-1',
    occurred_at: '2026-01-01T10:00:00Z',
    recorded_at: '2026-01-01T10:00:05Z',
    learner_text: 'The quick brown fox jumps over the lazy dog.',
    findings: [
      {
        span: 'quick brown fox',
        category: 'lexical_choice',
        polarity: 'ok',
      },
    ],
    overall_result: 'correct',
    self_confidence: 'normal',
    ...overrides,
  };
}

function makeBaseApproval(overrides: Partial<EvaluatorApproval> = {}): EvaluatorApproval {
  return {
    evaluator_type: 'llm',
    evaluator_id: 'gpt-4o',
    evaluator_version: '2024-05-13',
    task_class: 'independent_production',
    claim_type: 'lexical_accuracy',
    reliability_cap: 'usable',
    ...overrides,
  };
}

function makeBaseInput(overrides: Partial<AdmissibilityInput> = {}): AdmissibilityInput {
  return {
    candidate: makeBaseCandidate(),
    task: {
      task_class: 'independent_production',
      exposures: [],
    },
    registry: [makeBaseApproval()],
    taxonomy: ['lexical_choice', 'grammar', 'spelling'],
    corroborated_by_deterministic_check: false,
    new_event_id: 'new-evt-1',
    ...overrides,
  };
}

describe('ELOS Admissibility Layer - Milestone B', () => {
  it('unregistered evaluator, wrong version, wrong task_class, wrong claim_type each -> not_assessable "evaluator_not_approved"', () => {
    const base = makeBaseInput();

    // unregistered evaluator id
    const res1 = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        evaluator: { type: 'llm', id: 'unknown-model', version: '2024-05-13' },
      }),
    });
    assert.strictEqual(res1.outcome, 'not_assessable');
    if (res1.outcome === 'not_assessable') {
      assert.ok(res1.reasons.includes('evaluator_not_approved'));
    }

    // wrong version
    const res2 = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        evaluator: { type: 'llm', id: 'gpt-4o', version: '2024-01-01' },
      }),
    });
    assert.strictEqual(res2.outcome, 'not_assessable');
    if (res2.outcome === 'not_assessable') {
      assert.ok(res2.reasons.includes('evaluator_not_approved'));
    }

    // wrong task_class in registry approval
    const res3 = assessAdmissibility({
      ...base,
      task: { task_class: 'controlled_recall', exposures: [] },
      candidate: makeBaseCandidate({
        task_class: 'controlled_recall',
      }),
    });
    assert.strictEqual(res3.outcome, 'not_assessable');
    if (res3.outcome === 'not_assessable') {
      assert.ok(res3.reasons.includes('evaluator_not_approved'));
    }

    // wrong claim_type
    const res4 = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        claim_type: 'syntax_fluency',
      }),
    });
    assert.strictEqual(res4.outcome, 'not_assessable');
    if (res4.outcome === 'not_assessable') {
      assert.ok(res4.reasons.includes('evaluator_not_approved'));
    }

    // wrong evaluator_type
    const res5 = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        evaluator: { type: 'deterministic', id: 'gpt-4o', version: '2024-05-13' },
      }),
    });
    assert.strictEqual(res5.outcome, 'not_assessable');
    if (res5.outcome === 'not_assessable') {
      assert.ok(res5.reasons.includes('evaluator_not_approved'));
    }
  });

  it('fabricated span -> not_assessable; unknown category -> not_assessable; evaluator-declined -> not_assessable', () => {
    const base = makeBaseInput();

    // fabricated span
    const resSpan = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        findings: [
          {
            span: 'purple dinosaur flying',
            category: 'lexical_choice',
            polarity: 'error',
          },
        ],
      }),
    });
    assert.strictEqual(resSpan.outcome, 'not_assessable');
    if (resSpan.outcome === 'not_assessable') {
      assert.ok(resSpan.reasons.includes('span_not_grounded'));
    }

    // unknown category
    const resCat = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        findings: [
          {
            span: 'quick brown fox',
            category: 'quantum_grammar',
            polarity: 'ok',
          },
        ],
      }),
    });
    assert.strictEqual(resCat.outcome, 'not_assessable');
    if (resCat.outcome === 'not_assessable') {
      assert.ok(resCat.reasons.includes('category_not_in_taxonomy'));
    }

    // evaluator declined (overall_result not_assessable)
    const resDeclined = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        overall_result: 'not_assessable',
      }),
    });
    assert.strictEqual(resDeclined.outcome, 'not_assessable');
    if (resDeclined.outcome === 'not_assessable') {
      assert.ok(resDeclined.reasons.includes('evaluator_declined'));
    }
  });

  it('llm negative without corroboration -> candidate_concern with no event; with corroboration -> admissible incorrect event; deterministic evaluator negative -> admissible incorrect event', () => {
    const base = makeBaseInput();

    // LLM negative without corroboration
    const resUncorroborated = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        overall_result: 'incorrect',
        findings: [{ span: 'quick brown fox', category: 'lexical_choice', polarity: 'error' }],
      }),
      corroborated_by_deterministic_check: false,
    });
    assert.strictEqual(resUncorroborated.outcome, 'candidate_concern');
    if (resUncorroborated.outcome === 'candidate_concern') {
      assert.strictEqual(resUncorroborated.evaluator_key, 'llm:gpt-4o:2024-05-13');
      assert.deepStrictEqual(resUncorroborated.unit_refs, ['unit-101']);
      assert.strictEqual('event' in resUncorroborated, false);
    }

    // LLM negative with corroboration
    const resCorroborated = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        overall_result: 'incorrect',
        findings: [{ span: 'quick brown fox', category: 'lexical_choice', polarity: 'error' }],
      }),
      corroborated_by_deterministic_check: true,
    });
    assert.strictEqual(resCorroborated.outcome, 'admissible_event');
    if (resCorroborated.outcome === 'admissible_event') {
      assert.strictEqual(resCorroborated.event.result, 'incorrect');
      assert.strictEqual(resCorroborated.event.event_id, 'new-evt-1');
      assert.strictEqual(resCorroborated.event.payload_type, 'item_response');
      assert.strictEqual(resCorroborated.event.payload_version, 1);
      assert.deepStrictEqual(resCorroborated.event.payload, {
        item_id: 'cand-1',
        response: 'The quick brown fox jumps over the lazy dog.',
      });
    }

    // Deterministic evaluator negative
    const detCandidate = makeBaseCandidate({
      evaluator: { type: 'deterministic', id: 'regex-matcher', version: '1.0' },
      overall_result: 'incorrect',
    });
    const detApproval = makeBaseApproval({
      evaluator_type: 'deterministic',
      evaluator_id: 'regex-matcher',
      evaluator_version: '1.0',
    });
    const resDet = assessAdmissibility({
      ...base,
      candidate: detCandidate,
      registry: [detApproval],
      corroborated_by_deterministic_check: false,
    });
    assert.strictEqual(resDet.outcome, 'admissible_event');
    if (resDet.outcome === 'admissible_event') {
      assert.strictEqual(resDet.event.result, 'incorrect');
      assert.strictEqual(resDet.event.evaluator.type, 'deterministic');
    }
  });

  it('reliability: cap "low" gives an event with reliability "low"; cap "usable" with self_confidence "low" gives "low"; never "usable" above the cap', () => {
    const base = makeBaseInput();

    // Cap low, self_confidence normal -> low
    const resCapLow = assessAdmissibility({
      ...base,
      registry: [makeBaseApproval({ reliability_cap: 'low' })],
      candidate: makeBaseCandidate({ self_confidence: 'normal' }),
    });
    assert.strictEqual(resCapLow.outcome, 'admissible_event');
    if (resCapLow.outcome === 'admissible_event') {
      assert.strictEqual(resCapLow.event.reliability, 'low');
    }

    // Cap usable, self_confidence low -> low
    const resConfLow = assessAdmissibility({
      ...base,
      registry: [makeBaseApproval({ reliability_cap: 'usable' })],
      candidate: makeBaseCandidate({ self_confidence: 'low' }),
    });
    assert.strictEqual(resConfLow.outcome, 'admissible_event');
    if (resConfLow.outcome === 'admissible_event') {
      assert.strictEqual(resConfLow.event.reliability, 'low');
    }

    // Cap low, self_confidence low -> low
    const resBothLow = assessAdmissibility({
      ...base,
      registry: [makeBaseApproval({ reliability_cap: 'low' })],
      candidate: makeBaseCandidate({ self_confidence: 'low' }),
    });
    assert.strictEqual(resBothLow.outcome, 'admissible_event');
    if (resBothLow.outcome === 'admissible_event') {
      assert.strictEqual(resBothLow.event.reliability, 'low');
    }

    // Cap usable, self_confidence normal -> usable
    const resUsable = assessAdmissibility({
      ...base,
      registry: [makeBaseApproval({ reliability_cap: 'usable' })],
      candidate: makeBaseCandidate({ self_confidence: 'normal' }),
    });
    assert.strictEqual(resUsable.outcome, 'admissible_event');
    if (resUsable.outcome === 'admissible_event') {
      assert.strictEqual(resUsable.event.reliability, 'usable');
    }
  });

  it('exposures present on an independent_production candidate -> task_class guided_production and downgraded true; exposures on other classes -> not downgraded', () => {
    const base = makeBaseInput();

    // independent_production with assistance exposures -> downgraded to guided_production
    const resIndepDowngraded = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({ task_class: 'independent_production' }),
      task: {
        task_class: 'independent_production',
        exposures: [{ kind: 'hint' }, { kind: 'reformulation' }],
      },
    });
    assert.strictEqual(resIndepDowngraded.outcome, 'admissible_event');
    if (resIndepDowngraded.outcome === 'admissible_event') {
      assert.strictEqual(resIndepDowngraded.event.task_class, 'guided_production');
      assert.strictEqual(resIndepDowngraded.downgraded, true);
    }

    // independent_production with empty exposures -> not downgraded
    const resIndepNoExp = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({ task_class: 'independent_production' }),
      task: {
        task_class: 'independent_production',
        exposures: [],
      },
    });
    assert.strictEqual(resIndepNoExp.outcome, 'admissible_event');
    if (resIndepNoExp.outcome === 'admissible_event') {
      assert.strictEqual(resIndepNoExp.event.task_class, 'independent_production');
      assert.strictEqual(resIndepNoExp.downgraded, false);
    }

    // controlled_recall with exposures -> not downgraded
    const resControlled = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({ task_class: 'controlled_recall' }),
      registry: [makeBaseApproval({ task_class: 'controlled_recall' })],
      task: {
        task_class: 'controlled_recall',
        exposures: [{ kind: 'translation' }],
      },
    });
    assert.strictEqual(resControlled.outcome, 'admissible_event');
    if (resControlled.outcome === 'admissible_event') {
      assert.strictEqual(resControlled.event.task_class, 'controlled_recall');
      assert.strictEqual(resControlled.downgraded, false);
    }

    // guided_production with exposures -> not downgraded
    const resGuided = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({ task_class: 'guided_production' }),
      registry: [makeBaseApproval({ task_class: 'guided_production' })],
      task: {
        task_class: 'guided_production',
        exposures: [{ kind: 'rescue' }],
      },
    });
    assert.strictEqual(resGuided.outcome, 'admissible_event');
    if (resGuided.outcome === 'admissible_event') {
      assert.strictEqual(resGuided.event.task_class, 'guided_production');
      assert.strictEqual(resGuided.downgraded, false);
    }
  });

  it('integration: a stream of llm-evaluated correct events built through assessAdmissibility with cap "low" leaves deriveUnitState at "exposure" or lower progress only (never advances beyond what usable events allow); with cap "usable" the same stream can reach "spontaneous" but never "mastery"', () => {
    const taskClasses = [
      'recognition_item',
      'recognition_item',
      'controlled_recall',
      'guided_production',
      'independent_production',
      'independent_production',
    ] as const;

    // Stream with cap "low"
    const eventsLow = taskClasses.map((tc, idx) => {
      const candidate = makeBaseCandidate({
        candidate_id: `cand-low-${idx}`,
        task_class: tc,
        occurred_at: `2026-01-01T10:${String(idx * 5).padStart(2, '0')}:00Z`,
        recorded_at: `2026-01-01T10:${String(idx * 5).padStart(2, '0')}:01Z`,
        context_id: `ctx-${idx}`,
      });
      const approval = makeBaseApproval({
        task_class: tc,
        reliability_cap: 'low',
      });
      const adm = assessAdmissibility({
        candidate,
        task: { task_class: tc, exposures: [] },
        registry: [approval],
        taxonomy: ['lexical_choice'],
        corroborated_by_deterministic_check: false,
        new_event_id: `evt-low-${idx}`,
      });
      assert.strictEqual(adm.outcome, 'admissible_event');
      if (adm.outcome !== 'admissible_event') throw new Error('Failed');
      return adm.event;
    });

    const resLow = deriveUnitState('unit-101', eventsLow, { minDelayMs: 60000 });
    // All events have reliability 'low', so usableEventCount is 0, state stays 'unknown'
    assert.strictEqual(resLow.state, 'unknown');
    assert.strictEqual(resLow.usableEventCount, 0);

    // Stream with cap "usable"
    const eventsUsable = taskClasses.map((tc, idx) => {
      const candidate = makeBaseCandidate({
        candidate_id: `cand-usable-${idx}`,
        task_class: tc,
        occurred_at: `2026-01-01T10:${String(idx * 10).padStart(2, '0')}:00Z`,
        recorded_at: `2026-01-01T10:${String(idx * 10).padStart(2, '0')}:01Z`,
        context_id: `ctx-${idx}`,
      });
      const approval = makeBaseApproval({
        task_class: tc,
        reliability_cap: 'usable',
      });
      const adm = assessAdmissibility({
        candidate,
        task: { task_class: tc, exposures: [] },
        registry: [approval],
        taxonomy: ['lexical_choice'],
        corroborated_by_deterministic_check: false,
        new_event_id: `evt-usable-${idx}`,
      });
      assert.strictEqual(adm.outcome, 'admissible_event');
      if (adm.outcome !== 'admissible_event') throw new Error('Failed');
      return adm.event;
    });

    const resUsable = deriveUnitState('unit-101', eventsUsable, { minDelayMs: 60000 });
    // Progress reaches 'spontaneous' (idx 0 -> exposure, idx 1 -> recognition, idx 2 -> controlled, idx 3 -> guided, idx 4 -> spontaneous)
    // But idx 5 is evaluated by 'llm', which cannot belong to Q and cannot trigger spontaneous -> mastery!
    assert.strictEqual(resUsable.state, 'spontaneous');
  });

  it('determinism: same input gives deep-equal output', () => {
    const input = makeBaseInput();
    const res1 = assessAdmissibility(input);
    const res2 = assessAdmissibility(input);
    assert.deepStrictEqual(res1, res2);
  });

  it('B.1 rule 1: invalid shape inputs return not_assessable with candidate_invalid without throwing', () => {
    const base = makeBaseInput();

    // candidate not an object
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: null as any }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // string fields not strings
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: makeBaseCandidate({ candidate_id: 123 as any }) }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // findings not an array
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: makeBaseCandidate({ findings: 'not-array' as any }) }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // finding missing category or invalid polarity
    assert.deepStrictEqual(assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({ findings: [{ span: 'test', category: 'cat', polarity: 'invalid' as any }] }),
    }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // unit_refs not an array
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: makeBaseCandidate({ unit_refs: 'not-array' as any }) }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // overall_result invalid
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: makeBaseCandidate({ overall_result: 'super_correct' as any }) }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // self_confidence invalid
    assert.deepStrictEqual(assessAdmissibility({ ...base, candidate: makeBaseCandidate({ self_confidence: 'high' as any }) }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // registry not an array
    assert.deepStrictEqual(assessAdmissibility({ ...base, registry: {} as any }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // taxonomy not an array
    assert.deepStrictEqual(assessAdmissibility({ ...base, taxonomy: 'not-array' as any }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });

    // task not an object with exposures array
    assert.deepStrictEqual(assessAdmissibility({ ...base, task: { task_class: 'independent_production', exposures: 'not-array' as any } }), {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    });
  });

  it('B.1 rule 2: planner authority returns task_class_mismatch when candidate.task_class !== task.task_class', () => {
    const base = makeBaseInput({
      candidate: makeBaseCandidate({ task_class: 'controlled_recall' }),
      task: { task_class: 'independent_production', exposures: [] },
    });
    const res = assessAdmissibility(base);
    assert.deepStrictEqual(res, {
      outcome: 'not_assessable',
      reasons: ['task_class_mismatch'],
    });
  });

  it('B.1 rule 3: empty or whitespace-only span is not grounded', () => {
    const base = makeBaseInput();

    // empty span
    const resEmpty = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        findings: [{ span: '', category: 'lexical_choice', polarity: 'ok' }],
      }),
    });
    assert.deepStrictEqual(resEmpty, {
      outcome: 'not_assessable',
      reasons: ['span_not_grounded'],
    });

    // whitespace-only span
    const resWhitespace = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        findings: [{ span: '   \t  ', category: 'lexical_choice', polarity: 'ok' }],
      }),
    });
    assert.deepStrictEqual(resWhitespace, {
      outcome: 'not_assessable',
      reasons: ['span_not_grounded'],
    });
  });

  it('B.1 rule 4: overall_result "correct" with any finding of polarity "error" -> result_findings_conflict', () => {
    const base = makeBaseInput({
      candidate: makeBaseCandidate({
        overall_result: 'correct',
        findings: [
          { span: 'quick', category: 'lexical_choice', polarity: 'ok' },
          { span: 'brown', category: 'lexical_choice', polarity: 'error' },
        ],
      }),
    });
    const res = assessAdmissibility(base);
    assert.deepStrictEqual(res, {
      outcome: 'not_assessable',
      reasons: ['result_findings_conflict'],
    });
  });

  it('B.1 rule 5: evaluator "llm" with overall_result "incorrect" or "partial" requires at least one error finding', () => {
    const base = makeBaseInput();

    // LLM with incorrect and only "ok" findings
    const resIncorrect = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        overall_result: 'incorrect',
        findings: [{ span: 'quick', category: 'lexical_choice', polarity: 'ok' }],
      }),
    });
    assert.deepStrictEqual(resIncorrect, {
      outcome: 'not_assessable',
      reasons: ['negative_without_error_finding'],
    });

    // LLM with partial and only "ok" findings
    const resPartial = assessAdmissibility({
      ...base,
      candidate: makeBaseCandidate({
        overall_result: 'partial',
        findings: [{ span: 'quick', category: 'lexical_choice', polarity: 'ok' }],
      }),
    });
    assert.deepStrictEqual(resPartial, {
      outcome: 'not_assessable',
      reasons: ['negative_without_error_finding'],
    });
  });

  it('B.1 test (a): event_invalid path when unit_refs is empty', () => {
    const base = makeBaseInput({
      candidate: makeBaseCandidate({
        unit_refs: [],
      }),
    });
    const res = assessAdmissibility(base);
    assert.strictEqual(res.outcome, 'not_assessable');
    if (res.outcome === 'not_assessable') {
      assert.ok(res.reasons.includes('event_invalid'));
    }
  });

  it('B.1 test (b): produced event envelope fields match and unit_refs is cloned not same reference', () => {
    const candidate = makeBaseCandidate({
      context_id: 'ctx-99',
      skill: 'syntax',
      modality: 'productive_spoken',
      occurred_at: '2026-02-01T12:00:00Z',
      recorded_at: '2026-02-01T12:00:01Z',
      unit_refs: ['u-1', 'u-2'],
    });
    const base = makeBaseInput({ candidate });
    const res = assessAdmissibility(base);
    assert.strictEqual(res.outcome, 'admissible_event');
    if (res.outcome === 'admissible_event') {
      assert.strictEqual(res.event.context_id, candidate.context_id);
      assert.strictEqual(res.event.skill, candidate.skill);
      assert.strictEqual(res.event.modality, candidate.modality);
      assert.strictEqual(res.event.occurred_at, candidate.occurred_at);
      assert.strictEqual(res.event.recorded_at, candidate.recorded_at);
      assert.deepStrictEqual(res.event.unit_refs, candidate.unit_refs);
      assert.notStrictEqual(res.event.unit_refs, candidate.unit_refs);
    }
  });

  it('B.1 test (c): function does not mutate its input (deep-frozen input)', () => {
    function deepFreeze<T>(obj: T): T {
      if (obj === null || typeof obj !== 'object') return obj;
      Object.freeze(obj);
      for (const key of Object.keys(obj as any)) {
        deepFreeze((obj as any)[key]);
      }
      return obj;
    }

    const input = deepFreeze(makeBaseInput({
      task: {
        task_class: 'independent_production',
        exposures: [{ kind: 'hint' }],
      },
    }));

    const res = assessAdmissibility(input);
    assert.strictEqual(res.outcome, 'admissible_event');
    if (res.outcome === 'admissible_event') {
      assert.strictEqual(res.downgraded, true);
      assert.strictEqual(res.event.task_class, 'guided_production');
    }
  });

  it('the purity test must also scan src/kernel/admissibility.ts', () => {
    const filePath = path.resolve(process.cwd(), 'src/kernel/admissibility.ts');
    assert.ok(fs.existsSync(filePath), 'src/kernel/admissibility.ts does not exist');

    const content = fs.readFileSync(filePath, 'utf-8');

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

    for (const token of forbiddenTokens) {
      assert.ok(
        !content.includes(token),
        `Forbidden token "${token}" found in admissibility.ts`
      );
    }

    const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importSource = match[1];
      assert.ok(
        importSource.startsWith('./') || importSource.startsWith('../'),
        `External import "${importSource}" found in admissibility.ts`
      );
    }
  });
});
