import {
  EvidenceEvent,
  validateEvent,
  deriveFromClient,
  activeEvents,
  recordLocalEvent,
  ClientState,
} from '../kernel/index.js';

export type ExerciseTaskClass = 'recognition_item' | 'controlled_recall';

export interface Exercise {
  id: string;
  unit_id: string;
  task_class: ExerciseTaskClass;
  context_id: string;
  prompt: string;
  options?: string[];
  answer: string;
}

export const EXERCISE_BANK: Exercise[] = [
  {
    id: 'r1',
    unit_id: 'grammar:go-went-gone',
    task_class: 'recognition_item',
    context_id: 'home',
    prompt: 'She has already ___ home.',
    options: ['went', 'gone', 'go'],
    answer: 'gone',
  },
  {
    id: 'r2',
    unit_id: 'grammar:go-went-gone',
    task_class: 'recognition_item',
    context_id: 'market',
    prompt: 'Yesterday we ___ to the market.',
    options: ['gone', 'went', 'go'],
    answer: 'went',
  },
  {
    id: 'r3',
    unit_id: 'grammar:go-went-gone',
    task_class: 'recognition_item',
    context_id: 'school',
    prompt: 'They have ___ to school.',
    options: ['went', 'gone', 'go'],
    answer: 'gone',
  },
  {
    id: 'r4',
    unit_id: 'grammar:go-went-gone',
    task_class: 'recognition_item',
    context_id: 'gym',
    prompt: 'Last week I ___ to the gym every morning.',
    options: ['go', 'went', 'gone'],
    answer: 'went',
  },
  {
    id: 'c1',
    unit_id: 'grammar:go-went-gone',
    task_class: 'controlled_recall',
    context_id: 'out',
    prompt: 'He has ___ out. (go)',
    answer: 'gone',
  },
  {
    id: 'c2',
    unit_id: 'grammar:go-went-gone',
    task_class: 'controlled_recall',
    context_id: 'night',
    prompt: 'Last night I ___ to bed early. (go)',
    answer: 'went',
  },
  {
    id: 'c3',
    unit_id: 'grammar:go-went-gone',
    task_class: 'controlled_recall',
    context_id: 'work',
    prompt: 'My brother has ___ to work. (go)',
    answer: 'gone',
  },
  {
    id: 'c4',
    unit_id: 'grammar:go-went-gone',
    task_class: 'controlled_recall',
    context_id: 'bus',
    prompt: 'I ___ to school by bus yesterday. (go)',
    answer: 'went',
  },
];

export function normalizeAnswer(str: string): string {
  let s = str.trim().toLowerCase();
  if (s.endsWith('.')) {
    s = s.slice(0, -1);
  }
  return s;
}

export function checkAnswer(exercise: Exercise, response: string): boolean {
  return normalizeAnswer(response) === normalizeAnswer(exercise.answer);
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
 * TEMPORARY stub planner for Milestone D.
 * Note: This is a TEMPORARY stub and is NOT the final planner.
 */
export function pickNextItem(
  state: ClientState,
  bank: Exercise[],
  lastItemId: string | null
): Exercise {
  const targetUnitId = bank[0]?.unit_id ?? 'grammar:go-went-gone';
  // 86400000 ms is a placeholder HYPOTHESIS
  const derived = deriveFromClient(state, targetUnitId, { minDelayMs: 86400000 });
  const wantedClass: ExerciseTaskClass =
    derived.state === 'unknown' || derived.state === 'exposure'
      ? 'recognition_item'
      : 'controlled_recall';

  const classItems = bank.filter(item => item.task_class === wantedClass);
  let candidates = classItems.filter(item => lastItemId === null || item.id !== lastItemId);
  if (candidates.length === 0) {
    candidates = classItems.length > 0 ? classItems : bank;
  }

  const events = activeEvents(state);
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
