import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  EvidenceEvent,
  State,
} from '../src/kernel/index.js';
import {
  CurriculumUnit,
  PlannerConfig,
  PlannedTask,
  planSession,
  taskClassForState,
} from '../src/kernel/planner.js';

function makeBaseEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    event_id: 'evt-1',
    payload_type: 'item_response',
    payload_version: 1,
    occurred_at: '2026-01-01T10:00:00Z',
    recorded_at: '2026-01-01T10:00:01Z',
    unit_refs: ['unit-a'],
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

const T0 = Date.parse('2026-01-01T10:00:00Z');
function isoAt(ms: number): string {
  return new Date(T0 + ms).toISOString();
}

// steps: 1h, so a unit with one correct event is due after 1h.
const config: PlannerConfig = {
  session_size: 10,
  max_new_units: 1,
  items_per_due_unit: 1,
  items_per_continue_unit: 2,
  items_per_new_unit: 3,
  max_items_per_unit: 5,
  prerequisite_min_state: 'recognition',
  derive: { minDelayMs: 86400000 },
  review: { steps_ms: [3600000, 10800000, 25200000], relearn_delay_ms: 600000 },
};

function unit(
  id: string,
  cefr: CurriculumUnit['cefr'],
  prerequisites: string[],
  order: number
): CurriculumUnit {
  return { id, cefr, prerequisites, order };
}

/** n correct recognition events for a unit at successive times (state ladder). */
function correctEvents(unitId: string, n: number, startMs = 0): EvidenceEvent[] {
  const events: EvidenceEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push(
      makeBaseEvent({
        event_id: `${unitId}-c${i}`,
        unit_refs: [unitId],
        occurred_at: isoAt(startMs + i * 1000),
        context_id: `ctx-${i}`,
      })
    );
  }
  return events;
}

/** A correct controlled_recall event (advances recognition -> controlled). */
function recallEvent(unitId: string, atMs: number): EvidenceEvent {
  return makeBaseEvent({
    event_id: `${unitId}-r1`,
    unit_refs: [unitId],
    occurred_at: isoAt(atMs),
    task_class: 'controlled_recall',
    modality: 'productive_written',
    context_id: 'ctx-recall',
  });
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

describe('ELOS Session Planner - Milestone F2', () => {
  it('taskClassForState table', () => {
    assert.strictEqual(taskClassForState('unknown'), 'recognition_item');
    assert.strictEqual(taskClassForState('exposure'), 'recognition_item');
    assert.strictEqual(taskClassForState('recognition'), 'controlled_recall');
    assert.strictEqual(taskClassForState('controlled'), 'controlled_recall');
    assert.strictEqual(taskClassForState('guided'), 'controlled_recall');
    assert.strictEqual(taskClassForState('spontaneous'), 'controlled_recall');
    assert.strictEqual(taskClassForState('mastery'), 'controlled_recall');
  });

  it('due reviews come before continue before new', () => {
    const curriculum = [
      unit('unit-due', 'A1', [], 0),
      unit('unit-continue', 'A1', [], 1),
      unit('unit-new', 'A1', [], 2),
    ];
    const events = [
      // unit-due: started 2h ago -> due now
      ...correctEvents('unit-due', 1, 0),
      // unit-continue: started 90 minutes ago, due in 150 min -> not due yet,
      // state "exposure" is below "controlled" -> continue tier
      ...correctEvents('unit-continue', 1, 90 * 60 * 1000),
    ];
    const tasks = planSession(curriculum, events, isoAt(2 * 3600000), config);
    assert.ok(tasks.length > 0);
    const tiers = tasks.map(t => t.tier);
    const firstDue = tiers.indexOf('due_review');
    const firstContinue = tiers.indexOf('continue');
    const firstNew = tiers.indexOf('new_unit');
    assert.ok(firstDue !== -1, 'expected a due_review task');
    assert.ok(firstContinue !== -1, 'expected a continue task');
    assert.ok(firstNew !== -1, 'expected a new_unit task');
    assert.ok(firstDue < firstContinue && firstContinue < firstNew);
    // Round-robin over the three selected units starts with the due unit.
    assert.strictEqual(tasks[0].unit_id, 'unit-due');
  });

  it('a due unit is not also listed in the continue tier', () => {
    const curriculum = [
      unit('unit-due', 'A1', [], 0),
      unit('unit-continue', 'A1', [], 1),
      unit('unit-new', 'A1', [], 2),
    ];
    const events = [
      ...correctEvents('unit-due', 1, 0),
      ...correctEvents('unit-continue', 1, 90 * 60 * 1000),
    ];
    const tasks = planSession(curriculum, events, isoAt(2 * 3600000), config);
    const continueUnits = tasks
      .filter(t => t.tier === 'continue')
      .map(t => t.unit_id);
    assert.ok(
      continueUnits.every(id => id !== 'unit-due'),
      'a due unit must not appear as a continue task'
    );
    assert.deepStrictEqual([...new Set(continueUnits)], ['unit-continue']);
  });

  it('due units are sorted by due_at ascending', () => {
    const curriculum = [
      unit('unit-second-due', 'A1', [], 0),
      unit('unit-first-due', 'A1', [], 1),
    ];
    // unit-first-due was answered 30 minutes later, so its due_at is later.
    const events = [
      ...correctEvents('unit-second-due', 1, 0),
      ...correctEvents('unit-first-due', 1, 30 * 60 * 1000),
    ];
    const tasks = planSession(curriculum, events, isoAt(2 * 3600000), config);
    const dueOrder = tasks.filter(t => t.tier === 'due_review').map(t => t.unit_id);
    assert.deepStrictEqual(
      [...new Set(dueOrder)],
      ['unit-second-due', 'unit-first-due']
    );
  });

  it('max_new_units is respected', () => {
    const curriculum = [
      unit('unit-new-1', 'A1', [], 0),
      unit('unit-new-2', 'A1', [], 1),
      unit('unit-new-3', 'A1', [], 2),
    ];
    const tasks = planSession(curriculum, [], isoAt(0), {
      ...config,
      max_new_units: 2,
    });
    const newUnits = new Set(tasks.map(t => t.unit_id));
    assert.deepStrictEqual([...newUnits], ['unit-new-1', 'unit-new-2']);
  });

  it('a unit whose prerequisites are below prerequisite_min_state is not selected', () => {
    const curriculum = [
      unit('unit-parent', 'A1', [], 0),
      unit('unit-child', 'A2', ['unit-parent'], 1),
    ];
    // unit-parent has one correct event -> state "exposure" (rank 1 < recognition rank 2).
    const events = correctEvents('unit-parent', 1);
    const tasks = planSession(curriculum, events, isoAt(0), config);
    assert.ok(tasks.every(t => t.unit_id !== 'unit-child'));
    assert.ok(tasks.some(t => t.unit_id === 'unit-parent' && t.tier === 'continue'));

    // Once the prerequisite reaches "recognition", the child becomes selectable.
    const events2 = correctEvents('unit-parent', 2);
    const tasks2 = planSession(curriculum, events2, isoAt(0), config);
    assert.ok(tasks2.some(t => t.unit_id === 'unit-child' && t.tier === 'new_unit'));
  });

  it('a prerequisite that does not exist in the curriculum blocks selection', () => {
    const curriculum = [unit('unit-orphan', 'A1', ['ghost-unit'], 0)];
    const tasks = planSession(curriculum, [], isoAt(0), config);
    assert.deepStrictEqual(tasks, []);
  });

  it('ordering of new units is by cefr ascending, then order', () => {
    const curriculum = [
      unit('unit-b1-low-order', 'B1', [], 0),
      unit('unit-a2', 'A2', [], 1),
      unit('unit-a1', 'A1', [], 5),
      unit('unit-a1-higher-order', 'A1', [], 7),
    ];
    const tasks = planSession(curriculum, [], isoAt(0), {
      ...config,
      max_new_units: 4,
    });
    const newUnits = [...new Set(tasks.map(t => t.unit_id))];
    assert.deepStrictEqual(newUnits, [
      'unit-a1',
      'unit-a1-higher-order',
      'unit-a2',
      'unit-b1-low-order',
    ]);
  });

  it('units started and not due appear as "continue" only while their state is below "controlled"', () => {
    const curriculum = [unit('unit-x', 'A1', [], 0)];
    // 2 correct recognition events -> recognition (still below controlled).
    const events = correctEvents('unit-x', 2);
    const tasks = planSession(curriculum, events, isoAt(0), config);
    assert.ok(tasks.length > 0);
    assert.ok(tasks.every(t => t.tier === 'continue'));

    // A correct controlled_recall event advances to "controlled": no longer
    // "continue", and not due yet, so nothing is selected.
    const events3 = [...correctEvents('unit-x', 2), recallEvent('unit-x', 3000)];
    const tasks3 = planSession(curriculum, events3, isoAt(0), config);
    assert.deepStrictEqual(tasks3, []);

    // Once the review becomes due again, the unit returns as due_review.
    const tasksDue = planSession(curriculum, events3, isoAt(3600000), config);
    assert.ok(tasksDue.length > 0);
    assert.ok(tasksDue.every(t => t.tier === 'due_review'));
  });

  it('tasks are interleaved: no two consecutive tasks of the same unit when two or more units are selected', () => {
    const curriculum = [
      unit('unit-a', 'A1', [], 0),
      unit('unit-b', 'A1', [], 1),
    ];
    const tasks = planSession(curriculum, [], isoAt(0), { ...config, max_new_units: 2 });
    assert.ok(tasks.length >= 6, 'expected base counts from two units');
    for (let i = 1; i < tasks.length; i++) {
      assert.notStrictEqual(
        tasks[i].unit_id,
        tasks[i - 1].unit_id,
        `Consecutive tasks ${i - 1} and ${i} belong to the same unit`
      );
    }
  });

  it('session_size is respected', () => {
    const curriculum = [
      unit('unit-a', 'A1', [], 0),
      unit('unit-b', 'A1', [], 1),
      unit('unit-c', 'A1', [], 2),
    ];
    const tasks = planSession(curriculum, [], isoAt(0), {
      ...config,
      session_size: 7,
      max_new_units: 3,
    });
    assert.strictEqual(tasks.length, 7);

    const tasksZero = planSession(curriculum, [], isoAt(0), { ...config, session_size: 0 });
    assert.deepStrictEqual(tasksZero, []);
  });

  it('extra tasks fill up to max_items_per_unit per unit', () => {
    const curriculum = [unit('unit-a', 'A1', [], 0)];
    // One new unit: base 3, cap 5, session_size 10 -> exactly 5 tasks.
    const tasks = planSession(curriculum, [], isoAt(0), config);
    assert.strictEqual(tasks.length, 5);
    assert.ok(tasks.every(t => t.unit_id === 'unit-a'));
  });

  it('reasons are set for every tier', () => {
    const curriculum = [
      unit('unit-due', 'A1', [], 0),
      unit('unit-continue', 'A1', [], 1),
      unit('unit-new', 'A1', [], 2),
    ];
    const events = [
      ...correctEvents('unit-due', 1, 0),
      ...correctEvents('unit-continue', 1, 90 * 60 * 1000),
    ];
    const tasks = planSession(curriculum, events, isoAt(2 * 3600000), config);

    const dueTask = tasks.find(t => t.tier === 'due_review')!;
    assert.ok(dueTask.reason.startsWith('due_at='));

    const continueTask = tasks.find(t => t.tier === 'continue')!;
    assert.ok(continueTask.reason.startsWith('state='));

    const newTask = tasks.find(t => t.tier === 'new_unit')!;
    assert.strictEqual(newTask.reason, 'prerequisites satisfied');

    for (const t of tasks) {
      assert.ok(typeof t.reason === 'string' && t.reason.length > 0);
    }
  });

  it('deterministic: the same inputs give the same plan', () => {
    const curriculum = [
      unit('unit-due', 'A1', [], 0),
      unit('unit-continue', 'A1', [], 1),
      unit('unit-new', 'A1', [], 2),
    ];
    const events = [
      ...correctEvents('unit-due', 1, 0),
      ...correctEvents('unit-continue', 1, 10 * 60 * 1000),
    ];
    const a = planSession(curriculum, events, isoAt(2 * 3600000), config);
    const b = planSession(curriculum, events, isoAt(2 * 3600000), config);
    assert.deepStrictEqual(a, b);
  });

  it('nothing selected returns []', () => {
    // A started unit at "controlled" that is not due: no due, no continue,
    // no new units (it is not unknown) -> empty plan.
    const curriculum = [unit('unit-x', 'A1', [], 0)];
    const events = [...correctEvents('unit-x', 2), recallEvent('unit-x', 3000)];
    const tasks = planSession(curriculum, events, isoAt(0), config);
    assert.deepStrictEqual(tasks, []);
  });

  it('inputs are not mutated (deep-freeze)', () => {
    const curriculum = deepFreeze([
      unit('unit-due', 'A1', [], 0),
      unit('unit-continue', 'A1', [], 1),
      unit('unit-new', 'A1', [], 2),
    ]);
    const events = deepFreeze([
      ...correctEvents('unit-due', 1, 0),
      ...correctEvents('unit-continue', 1, 90 * 60 * 1000),
    ]);
    const frozenConfig = deepFreeze({
      ...config,
      review: { ...config.review },
    });
    const tasks: PlannedTask[] = planSession(
      curriculum,
      events,
      isoAt(2 * 3600000),
      frozenConfig
    );
    assert.ok(tasks.length > 0);
    // Frozen inputs would throw on any mutation attempt; deepStrictEqual
    // below re-verifies the inputs survived unchanged.
    assert.deepStrictEqual(events[0].event_id, 'unit-due-c0');
    assert.deepStrictEqual(curriculum[0].id, 'unit-due');
  });

  it('purity: src/kernel/schedule.ts and src/kernel/planner.ts exist and are scanned by the kernel purity test', () => {
    const kernelDir = path.resolve(process.cwd(), 'src/kernel');
    const files = fs.readdirSync(kernelDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    assert.ok(files.includes('schedule.ts'), 'src/kernel/schedule.ts must exist');
    assert.ok(files.includes('planner.ts'), 'src/kernel/planner.ts must exist');

    // The kernel purity test scans every file in src/kernel; these two files
    // must contain no forbidden token themselves.
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
    for (const file of ['schedule.ts', 'planner.ts']) {
      const content = fs.readFileSync(path.join(kernelDir, file), 'utf-8');
      for (const token of forbiddenTokens) {
        assert.ok(!content.includes(token), `Forbidden token "${token}" found in ${file}`);
      }
    }
  });
});
