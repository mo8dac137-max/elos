import { CurriculumUnit, PlannerConfig } from '../kernel/index.js';
import { GRAMMAR_PACK } from '../content/grammar-pack.js';
import type { CurriculumUnitDef } from '../content/types.js';

// The curriculum is derived from the grammar pack: order = array index.
export const CURRICULUM: CurriculumUnit[] = GRAMMAR_PACK.units.map((u, index) => ({
  id: u.id,
  cefr: u.cefr,
  prerequisites: u.prerequisites,
  order: index,
}));

export function findUnitDef(unitId: string): CurriculumUnitDef | undefined {
  return GRAMMAR_PACK.units.find((u) => u.id === unitId);
}

export function unitTitle(unitId: string): string {
  return findUnitDef(unitId)?.title ?? unitId;
}

const DAY_MS = 86400000;

// Every number below is a placeholder HYPOTHESIS to be tuned with the
// owner's real data, not a design decision.
export const PLANNER_CONFIG: PlannerConfig = {
  session_size: 10, // placeholder HYPOTHESIS
  max_new_units: 1, // placeholder HYPOTHESIS
  items_per_due_unit: 1, // placeholder HYPOTHESIS
  items_per_continue_unit: 2, // placeholder HYPOTHESIS
  items_per_new_unit: 3, // placeholder HYPOTHESIS
  max_items_per_unit: 5, // placeholder HYPOTHESIS
  prerequisite_min_state: 'recognition', // placeholder HYPOTHESIS
  derive: { minDelayMs: 86400000 }, // placeholder HYPOTHESIS
  review: {
    steps_ms: [1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS, 60 * DAY_MS], // placeholder HYPOTHESIS
    relearn_delay_ms: 600000, // placeholder HYPOTHESIS (10 minutes)
  },
};
