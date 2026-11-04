import { WORD_DEFS } from './word-defs.js';
import type { GrammarPack } from './types.js';
import type { WordDef } from './word-defs.js';

// Re-exported so every consumer keeps importing from this module
// (tests, curriculum, exercises and the reader UI all do).
export { WORD_DEFS } from './word-defs.js';
export type { WordDef } from './word-defs.js';

/**
 * Vocabulary packs (Milestones I1 + I3 + K1): 72 high-frequency A1 words for
 * an Arabic-speaking learner, three appended batches of 24. Each word becomes
 * ONE curriculum unit ("word:{lemma}") with its primary A1 sense, flowing
 * through the same kernel, planner, review schedule and session UI as grammar
 * units. The raw data lives in word-defs.ts; this file only derives the pack
 * (units + deterministic exercises) from it.
 *
 * Full Word DNA (per-sense mastery, receptive/productive tracks, aural
 * recognition, collocations, provider dictionaries) is designed in the
 * handoff and arrives in later slices; one word = one unit with the dominant
 * beginner sense remains the rule.
 *
 * Everything here is deterministic: no clock, no randomness, no I/O.
 */

export const WORD_COUNT = WORD_DEFS.length;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The two same-part-of-speech words that follow this one in pack order
 * (cyclically). Used as deterministic distractors so that options never mix
 * a noun meaning with verb meanings.
 */
function nextTwoSamePos(def: WordDef): [WordDef, WordDef] {
  const pos = WORD_DEFS.findIndex((w) => w.id === def.id);
  const peers = WORD_DEFS
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => w.pos === def.pos && i !== pos)
    .map(({ w }) => w);
  const after = peers.filter(
    (w) => WORD_DEFS.findIndex((x) => x.id === w.id) > pos
  );
  const before = peers.filter(
    (w) => WORD_DEFS.findIndex((x) => x.id === w.id) < pos
  );
  const ordered = [...after, ...before];
  return [ordered[0], ordered[1]];
}

/** Place the answer among the two distractors at the given position (0-2). */
function rotate3(answer: string, d1: string, d2: string, position: number): string[] {
  const base = [d1, d2];
  const pos = ((position % 3) + 3) % 3;
  base.splice(pos, 0, answer);
  return base;
}

function buildUnits(): GrammarPack['units'] {
  return WORD_DEFS.map((def) => ({
    id: `word:${def.id}`,
    title: `Word: ${def.id}`,
    cefr: 'A1' as const,
    prerequisites: [],
    summary_en: `${def.id} (${def.pos}): ${def.en}.`,
    summary_ar: def.ar,
    examples: [def.example],
    common_mistake_ar: def.mistake,
  }));
}

function buildItems(): GrammarPack['items'] {
  const items: GrammarPack['items'] = [];
  for (let i = 0; i < WORD_DEFS.length; i++) {
    const def = WORD_DEFS[i];
    const [a, b] = nextTwoSamePos(def);
    const unitId = `word:${def.id}`;

    // 1. Meaning recognition: English word -> choose the Arabic gloss.
    items.push({
      id: `w-${def.id}-1`,
      unit_id: unitId,
      task_class: 'recognition_item' as const,
      context_id: `w-${def.id}-1`,
      prompt: `What does «${def.id}» mean?`,
      options: rotate3(def.gloss, a.gloss, b.gloss, i % 3),
      answer: def.gloss,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });

    // 2. Context recognition: the example sentence with the lemma blanked.
    const fillPrompt = def.example.replace(
      new RegExp(`\\b${escapeRegExp(def.id)}\\b`),
      '___'
    );
    items.push({
      id: `w-${def.id}-2`,
      unit_id: unitId,
      task_class: 'recognition_item' as const,
      context_id: `w-${def.id}-2`,
      prompt: fillPrompt,
      options: rotate3(def.id, a.id, b.id, (i + 1) % 3),
      answer: def.id,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });

    // 3. Production: Arabic gloss -> type the English word.
    items.push({
      id: `w-${def.id}-3`,
      unit_id: unitId,
      task_class: 'controlled_recall' as const,
      context_id: `w-${def.id}-3`,
      prompt: `Type in English: ${def.gloss}`,
      answer: def.id,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });
  }
  return items;
}

export const WORD_PACK: GrammarPack = {
  units: buildUnits(),
  items: buildItems(),
};
