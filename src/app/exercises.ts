import {
  EvidenceEvent,
  ClientState,
  validateEvent,
  recordLocalEvent,
} from '../kernel/index.js';
import { GRAMMAR_PACK } from '../content/grammar-pack.js';
import type { ItemDef } from '../content/types.js';

export type ExerciseTaskClass = 'recognition_item' | 'controlled_recall';

export interface Exercise {
  id: string;
  unit_id: string;
  task_class: ExerciseTaskClass;
  context_id: string;
  prompt: string;
  options?: string[];
  answer: string;
  accepted?: string[];
  note_en?: string;
}

function toExercise(item: ItemDef): Exercise {
  return {
    id: item.id,
    unit_id: item.unit_id,
    task_class: item.task_class,
    context_id: item.context_id,
    prompt: item.prompt,
    options: item.options,
    answer: item.answer,
    accepted: item.accepted,
    note_en: item.note_en,
  };
}

// Every grammar-pack item, in pack order.
export const EXERCISE_BANK: Exercise[] = GRAMMAR_PACK.items.map(toExercise);

export function normalizeAnswer(str: string): string {
  let s = str.trim().toLowerCase();
  s = s.replace(/\u2019/g, "'");
  s = s.replace(/\s+/g, ' ');
  if (s.endsWith('.')) {
    s = s.slice(0, -1);
  }
  return s;
}

export function checkAnswer(exercise: Exercise, response: string): boolean {
  const normalized = normalizeAnswer(response);
  if (normalized === normalizeAnswer(exercise.answer)) {
    return true;
  }
  const accepted = exercise.accepted ?? [];
  return accepted.some((a) => normalized === normalizeAnswer(a));
}

export interface GeneratorContext {
  now: () => string;
  newId: () => string;
}

export function buildEvidenceEvent(
  exercise: Exercise,
  response: string,
  ctx: GeneratorContext
): EvidenceEvent {
  const isCorrect = checkAnswer(exercise, response);
  const modality =
    exercise.task_class === 'recognition_item'
      ? 'receptive_written'
      : 'productive_written';

  const timestamp = ctx.now();
  const event: EvidenceEvent = {
    event_id: ctx.newId(),
    payload_type: 'item_response',
    payload_version: 1,
    payload: {
      item_id: exercise.id,
      response,
    },
    unit_refs: [exercise.unit_id],
    skill: 'grammar',
    modality,
    task_class: exercise.task_class,
    context_id: exercise.context_id,
    evaluator: {
      type: 'deterministic',
      id: 'closed_item',
      version: '1',
    },
    reliability: 'usable',
    result: isCorrect ? 'correct' : 'incorrect',
    occurred_at: timestamp,
    recorded_at: timestamp,
  };

  const validation = validateEvent(event);
  if (!validation.ok) {
    throw new Error(`Generated invalid event: ${(validation.errors || []).join(', ')}`);
  }

  return event;
}

/**
 * Pick the next exercise for a unit and task class: among the items of that
 * unit and class, excluding lastItemId (unless it is the only one), return
 * the one answered the fewest times (counting active events whose
 * payload.item_id equals the item id); ties are broken by bank order.
 */
export function selectItem(
  bank: readonly Exercise[],
  unitId: string,
  taskClass: ExerciseTaskClass,
  events: readonly EvidenceEvent[],
  lastItemId: string | null
): Exercise {
  const ofUnitAndClass = bank.filter(
    (b) => b.unit_id === unitId && b.task_class === taskClass
  );
  if (ofUnitAndClass.length === 0) {
    throw new Error(`No items found for unit "${unitId}" and class "${taskClass}"`);
  }

  let candidates = ofUnitAndClass.filter(
    (item) => lastItemId === null || item.id !== lastItemId
  );
  if (candidates.length === 0) {
    candidates = ofUnitAndClass;
  }

  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.payload && typeof ev.payload === 'object') {
      const itemId = (ev.payload as Record<string, unknown>).item_id;
      if (typeof itemId === 'string') {
        counts.set(itemId, (counts.get(itemId) || 0) + 1);
      }
    }
  }

  let chosen = candidates[0];
  let minCount = Infinity;
  for (const item of candidates) {
    const count = counts.get(item.id) || 0;
    if (count < minCount) {
      minCount = count;
      chosen = item;
    }
  }

  return chosen;
}

export function submitAnswer(
  state: ClientState,
  exercise: Exercise,
  response: string,
  ctx: GeneratorContext
): { state: ClientState; event: EvidenceEvent; correct: boolean } {
  const event = buildEvidenceEvent(exercise, response, ctx);
  const rec = recordLocalEvent(state, event);
  if (rec.outcome !== 'recorded') {
    throw new Error(`Failed to record event: ${(rec.errors || []).join(', ')}`);
  }
  return {
    state: rec.state,
    event,
    correct: event.result === 'correct',
  };
}
