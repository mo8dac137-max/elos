import { CurriculumUnit, PlannerConfig } from '../kernel/index.js';
import { GRAMMAR_PACK } from '../content/grammar-pack.js';
import { WORD_PACK } from '../content/word-pack.js';
import type { CurriculumUnitDef } from '../content/types.js';

/**
 * The merged unit defs (Milestone I1): grammar units and the first word
 * batch interleaved — grammar keeps pack order on the even slots and words
 * take the odd slots — so the planner naturally alternates between one new
 * grammar unit and one new word unit, and the progress map lists both.
 */
export const ALL_UNIT_DEFS: CurriculumUnitDef[] = [];
const grammarUnits = GRAMMAR_PACK.units;
const wordUnits = WORD_PACK.units;
const maxLen = Math.max(grammarUnits.length, wordUnits.length);
for (let i = 0; i < maxLen; i++) {
  if (grammarUnits[i]) ALL_UNIT_DEFS.push(grammarUnits[i]);
  if (wordUnits[i]) ALL_UNIT_DEFS.push(wordUnits[i]);
}

// The curriculum is derived from the content packs: order = array index.
export const CURRICULUM: CurriculumUnit[] = ALL_UNIT_DEFS.map((u, index) => ({
  id: u.id,
  cefr: u.cefr,
  prerequisites: u.prerequisites,
  order: index,
}));

export function findUnitDef(unitId: string): CurriculumUnitDef | undefined {
  return ALL_UNIT_DEFS.find((u) => u.id === unitId);
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
