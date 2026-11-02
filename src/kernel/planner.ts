import {
  EvidenceEvent,
  State,
  TaskClass,
  DeriveUnitStateConfig,
  STATE_RANK,
  deriveUnitState,
} from './index.js';
import { ReviewConfig, deriveReviewInfo } from './schedule.js';

/**
 * Deterministic session planner (Pillar 5, F2).
 *
 * Pure kernel module: no clock, no randomness, no I/O. "now" is injected
 * as nowIso. The planner is a pure function of (curriculum, events, now,
 * config); it never mutates its inputs and every task carries a reason.
 */

export interface CurriculumUnit {
  id: string;
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  prerequisites: string[];
  order: number;
}

export interface PlannerConfig {
  session_size: number;
  max_new_units: number;
  items_per_due_unit: number;
  items_per_continue_unit: number;
  items_per_new_unit: number;
  max_items_per_unit: number;
  prerequisite_min_state: State;
  derive: DeriveUnitStateConfig;
  review: ReviewConfig;
}

export interface PlannedTask {
  unit_id: string;
  task_class: TaskClass;
  tier: 'due_review' | 'continue' | 'new_unit';
  reason: string;
}

const CEFR_RANK: Record<CurriculumUnit['cefr'], number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
};

/**
 * Only recognition_item and controlled_recall exercises exist so far,
 * so a unit below "recognition" trains recognition and every other
 * state trains controlled recall.
 */
export function taskClassForState(state: State): TaskClass {
  if (state === 'unknown' || state === 'exposure') {
    return 'recognition_item';
  }
  return 'controlled_recall';
}

interface SelectedUnit {
  id: string;
  state: State;
  tier: 'due_review' | 'continue' | 'new_unit';
  reason: string;
  baseCount: number;
}

/**
 * Plan one practice session.
 *
 * Tiers, in order: due_review (state not "unknown", due_at set and
 * <= now, sorted by due_at then order) > continue (state not "unknown",
 * not due, state rank below "controlled", sorted by state rank then
 * order) > new_unit (state "unknown", every prerequisite exists in the
 * curriculum with state rank >= prerequisite_min_state, sorted by cefr
 * then order, at most max_new_units).
 *
 * Tasks are produced round-robin over the selected units (one task per
 * unit per round, in selected order) up to each unit's tier base count;
 * if the session is still short, extra tasks continue round-robin,
 * never exceeding max_items_per_unit per unit, until session_size tasks
 * exist or every unit is at its cap.
 */
export function planSession(
  curriculum: readonly CurriculumUnit[],
  events: readonly unknown[],
  nowIso: string,
  config: PlannerConfig
): PlannedTask[] {
  const nowMs = Date.parse(nowIso);
  // planSession receives unknown[]; deriveUnitState expects EvidenceEvent[].
  // Selection inside deriveUnitState re-validates every event, so the cast
  // only satisfies the type system, it never admits invalid events.
  const kernelEvents = events as readonly EvidenceEvent[];

  const unitIds = new Set<string>(curriculum.map(u => u.id));
  const stateById = new Map<string, State>();
  for (const u of curriculum) {
    stateById.set(u.id, deriveUnitState(u.id, kernelEvents, config.derive).state);
  }

  // Tier 1: due reviews.
  const due: { unit: CurriculumUnit; state: State; due_at: string }[] = [];
  for (const u of curriculum) {
    const state = stateById.get(u.id)!;
    if (state === 'unknown') continue;
    const info = deriveReviewInfo(u.id, events, config.review);
    if (info.due_at === null) continue;
    if (Date.parse(info.due_at) <= nowMs) {
      due.push({ unit: u, state, due_at: info.due_at });
    }
  }
  due.sort((a, b) => {
    const cmp = Date.parse(a.due_at) - Date.parse(b.due_at);
    if (cmp !== 0) return cmp;
    return a.unit.order - b.unit.order;
  });

  const dueIds = new Set<string>(due.map(d => d.unit.id));

  // Tier 2: continue (started, not due, still below "controlled").
  const cont: { unit: CurriculumUnit; state: State }[] = [];
  for (const u of curriculum) {
    const state = stateById.get(u.id)!;
    if (state === 'unknown') continue;
    if (dueIds.has(u.id)) continue;
    if (STATE_RANK[state] < STATE_RANK['controlled']) {
      cont.push({ unit: u, state });
    }
  }
  cont.sort((a, b) => {
    const cmp = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (cmp !== 0) return cmp;
    return a.unit.order - b.unit.order;
  });

  // Tier 3: new units whose prerequisites are satisfied.
  const eligible: CurriculumUnit[] = [];
  for (const u of curriculum) {
    if (stateById.get(u.id) !== 'unknown') continue;
    const satisfied = u.prerequisites.every(
      p =>
        unitIds.has(p) &&
        STATE_RANK[stateById.get(p)!] >= STATE_RANK[config.prerequisite_min_state]
    );
    if (satisfied) {
      eligible.push(u);
    }
  }
  eligible.sort((a, b) => {
    const cmp = CEFR_RANK[a.cefr] - CEFR_RANK[b.cefr];
    if (cmp !== 0) return cmp;
    return a.order - b.order;
  });
  const chosenNew = eligible.slice(0, config.max_new_units);

  const selected: SelectedUnit[] = [];
  for (const d of due) {
    selected.push({
      id: d.unit.id,
      state: d.state,
      tier: 'due_review',
      reason: 'due_at=' + d.due_at,
      baseCount: config.items_per_due_unit,
    });
  }
  for (const c of cont) {
    selected.push({
      id: c.unit.id,
      state: c.state,
      tier: 'continue',
      reason: 'state=' + c.state,
      baseCount: config.items_per_continue_unit,
    });
  }
  for (const n of chosenNew) {
    selected.push({
      id: n.id,
      state: 'unknown',
      tier: 'new_unit',
      reason: 'prerequisites satisfied',
      baseCount: config.items_per_new_unit,
    });
  }

  if (selected.length === 0) {
    return [];
  }

  // Per-unit task budget: never more than max_items_per_unit in total.
  const budgets = selected.map(s => Math.max(0, Math.min(s.baseCount, config.max_items_per_unit)));

  const tasks: PlannedTask[] = [];
  const produced = selected.map(() => 0);

  const pushTask = (i: number) => {
    const s = selected[i];
    tasks.push({
      unit_id: s.id,
      task_class: taskClassForState(s.state),
      tier: s.tier,
      reason: s.reason,
    });
    produced[i] += 1;
  };

  // Phase 1: base counts, round-robin in selected order.
  let progressed = true;
  while (tasks.length < config.session_size && progressed) {
    progressed = false;
    for (let i = 0; i < selected.length && tasks.length < config.session_size; i++) {
      if (produced[i] < budgets[i]) {
        pushTask(i);
        progressed = true;
      }
    }
  }

  // Phase 2: extras up to the per-unit cap, round-robin in selected order.
  progressed = true;
  while (tasks.length < config.session_size && progressed) {
    progressed = false;
    for (let i = 0; i < selected.length && tasks.length < config.session_size; i++) {
      if (produced[i] < config.max_items_per_unit) {
        pushTask(i);
        progressed = true;
      }
    }
  }

  return tasks;
}
