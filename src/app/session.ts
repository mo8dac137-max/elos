import {
  ClientState,
  PlannedTask,
  State,
  planSession,
  activeEvents,
  deriveFromClient,
} from '../kernel/index.js';
import {
  Exercise,
  ExerciseTaskClass,
  EXERCISE_BANK,
  selectItem,
} from './exercises.js';
import { CURRICULUM, PLANNER_CONFIG } from './curriculum.js';

/** Plan a session of the given size from the current client state. */
export function startSession(
  state: ClientState,
  nowIso: string,
  size: number
): PlannedTask[] {
  return planSession(CURRICULUM, activeEvents(state), nowIso, {
    ...PLANNER_CONFIG,
    session_size: size,
  });
}

/** The concrete exercise for the next planned task. */
export function nextExercise(
  state: ClientState,
  task: PlannedTask,
  lastItemId: string | null
): Exercise {
  return selectItem(
    EXERCISE_BANK,
    task.unit_id,
    task.task_class as ExerciseTaskClass,
    activeEvents(state),
    lastItemId
  );
}

/**
 * True when a unit is still "unknown" and its intro card has not been
 * shown yet in this session.
 */
export function needsIntro(
  state: ClientState,
  unitId: string,
  alreadyShown: readonly string[]
): boolean {
  const derived = deriveFromClient(state, unitId, PLANNER_CONFIG.derive);
  return derived.state === 'unknown' && !alreadyShown.includes(unitId);
}

export interface UnitSummary {
  unit_id: string;
  state: State;
  due_at: string | null;
}

export interface SessionUnitSummary {
  unit_id: string;
  from: State;
  to: State;
  due_at: string | null;
}

/**
 * Compare per-unit summaries captured before and after a session: one row
 * per unit present in afterSummaries, with the state before (defaulting to
 * "unknown" when the unit was absent before) and the next review time.
 */
export function summarizeSession(
  beforeSummaries: readonly UnitSummary[],
  afterSummaries: readonly UnitSummary[]
): SessionUnitSummary[] {
  return afterSummaries.map((after) => {
    const before = beforeSummaries.find((s) => s.unit_id === after.unit_id);
    return {
      unit_id: after.unit_id,
      from: before ? before.state : 'unknown',
      to: after.state,
      due_at: after.due_at,
    };
  });
}
