import {
  ClientState,
  State,
  activeEvents,
  deriveFromClient,
  deriveReviewInfo,
} from '../kernel/index.js';
import { GRAMMAR_PACK } from '../content/grammar-pack.js';
import type { CefrBand } from '../content/types.js';
import { PLANNER_CONFIG } from './curriculum.js';

export type DueInfo =
  | { kind: 'not_started' }
  | { kind: 'due_now' }
  | { kind: 'later'; in_ms: number };

export interface ProgressUnit {
  unit_id: string;
  title: string;
  state: State;
  due: DueInfo;
}

export interface ProgressBand {
  band: CefrBand;
  units: ProgressUnit[];
}

const BAND_ORDER: readonly CefrBand[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

/**
 * The progress map: one entry per CEFR band that has units, each listing
 * every unit with its derived state and review status. No percentages or
 * scores anywhere.
 */
export function buildProgressMap(state: ClientState, nowIso: string): ProgressBand[] {
  const events = activeEvents(state);
  const nowMs = Date.parse(nowIso);
  const byBand = new Map<CefrBand, ProgressUnit[]>();

  for (const unitDef of GRAMMAR_PACK.units) {
    const derived = deriveFromClient(state, unitDef.id, PLANNER_CONFIG.derive);

    let due: DueInfo;
    if (derived.state === 'unknown') {
      due = { kind: 'not_started' };
    } else {
      const info = deriveReviewInfo(unitDef.id, events, PLANNER_CONFIG.review);
      if (info.due_at === null) {
        due = { kind: 'not_started' };
      } else if (Date.parse(info.due_at) <= nowMs) {
        due = { kind: 'due_now' };
      } else {
        due = { kind: 'later', in_ms: Date.parse(info.due_at) - nowMs };
      }
    }

    const entry: ProgressUnit = {
      unit_id: unitDef.id,
      title: unitDef.title,
      state: derived.state,
      due,
    };
    const list = byBand.get(unitDef.cefr) ?? [];
    list.push(entry);
    byBand.set(unitDef.cefr, list);
  }

  return BAND_ORDER.filter((band) => byBand.has(band)).map((band) => ({
    band,
    units: byBand.get(band)!,
  }));
}
