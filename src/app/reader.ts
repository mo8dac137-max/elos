import type { ClientState } from '../kernel/index.js';
import { deriveFromClient } from '../kernel/index.js';
import { CURRICULUM, PLANNER_CONFIG } from './curriculum.js';

/**
 * Milestone J1 (Smart Reader, first slice): the pure logic behind the
 * reading screen. Any English text the learner pastes (or picks from the
 * built-in samples) is tokenized deterministically, and every token that
 * matches a curriculum word unit is colored by the SAME derived state the
 * progress map uses - one source of truth: the evidence log.
 *
 * Two keys per token: dictKey is the trimmed lowercase token (what the
 * dictionary provider should look up), and key adds a conservative suffix
 * normalizer (-s/-es/-ies/-ed) so inflected forms still match their base
 * unit ("works" matches "work"). Irregular forms ("went", "children") do
 * not match in this slice; tapping them still opens the dictionary.
 *
 * Reading itself is receptive consumption and records NO evidence events
 * in this slice (the reading evidence taxonomy is a later, designed
 * addition). The persisted reading text is a UI preference (like the
 * session length), never learning data.
 */

/** The reader color of one word. */
export type ReaderWordState = 'new' | 'learning' | 'known' | 'outside';

/** One whitespace-separated token of the pasted text. */
export interface ReaderToken {
  /** The token exactly as it appeared in the text. */
  raw: string;
  /** Pack-matching key (normalized), or null for tokens without letters. */
  key: string | null;
  /** Dictionary lookup key (trimmed, unnormalized), or null. */
  dictKey: string | null;
}

/** Words that end in "s" but are already their own base form. */
const PACK_KEEP = new Set(['people']);

/**
 * The dictionary key of a raw token: lowercase, curly apostrophes folded,
 * trimmed of non-letter edges, inner letters and apostrophes kept
 * ("don't" stays "don't"). Returns null for tokens without letters.
 */
export function wordKey(raw: string): string | null {
  const normalized = raw.replace(/\u2019/g, "'").toLowerCase();
  const trimmed = normalized.replace(/^[^a-z']+/, '').replace(/[^a-z']+$/, '');
  if (!/[a-z]/.test(trimmed)) return null;
  if (!/^[a-z']+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Conservative suffix normalizer so inflected tokens match their base
 * unit. Only regular, unambiguous suffixes are stripped; everything else
 * (irregulars, -ing forms) is left as-is and simply stays unmatched.
 */
export function normalizeForPack(key: string): string {
  if (PACK_KEEP.has(key) || key.length < 4) return key;
  if (/(ies|ied)$/.test(key) && key.length >= 5) return key.slice(0, -3) + 'y';
  if (/oes$/.test(key)) return key.slice(0, -2);
  if (/(ch|sh|s|x|z)es$/.test(key) && key.length >= 5) return key.slice(0, -2);
  if (/ed$/.test(key) && !/eed$/.test(key) && key.length >= 5) return key.slice(0, -2);
  if (/s$/.test(key) && !/ss$/.test(key)) return key.slice(0, -1);
  return key;
}

/** Splits text into tokens on whitespace; never returns empty tokens. */
export function tokenizeText(text: string): ReaderToken[] {
  return text
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((raw) => {
      const dictKey = wordKey(raw);
      return { raw, key: dictKey === null ? null : normalizeForPack(dictKey), dictKey };
    });
}

/**
 * Maps one kernel unit state (the state ladder) to a reader color.
 * Unknown-but-in-course words are "new"; exposure/recognition are
 * "learning"; controlled and above are "known"; anything outside the
 * curriculum (or an unrecognized state) is "outside" and stays plain.
 */
export function readerStateFor(unitState: string | undefined): ReaderWordState {
  if (unitState === 'unknown') return 'new';
  if (unitState === 'exposure' || unitState === 'recognition') return 'learning';
  if (
    unitState === 'controlled' ||
    unitState === 'guided' ||
    unitState === 'spontaneous' ||
    unitState === 'mastery'
  ) {
    return 'known';
  }
  return 'outside';
}

/** Derives the reader state of every curriculum word unit from the log. */
export function deriveReaderStates(state: ClientState): Map<string, ReaderWordState> {
  const map = new Map<string, ReaderWordState>();
  for (const unit of CURRICULUM) {
    if (!unit.id.startsWith('word:')) continue;
    const word = unit.id.slice('word:'.length);
    map.set(word, readerStateFor(deriveFromClient(state, unit.id, PLANNER_CONFIG.derive).state));
  }
  return map;
}

/** Tally of one text's word tokens by reader state (for the summary line). */
export function countTokenStates(
  tokens: readonly ReaderToken[],
  states: Map<string, ReaderWordState>
): { words: number; known: number; learning: number; new: number } {
  const tally = { words: 0, known: 0, learning: 0, new: 0 };
  for (const token of tokens) {
    if (token.key === null) continue;
    tally.words += 1;
    const s = states.get(token.key) ?? 'outside';
    if (s === 'known') tally.known += 1;
    else if (s === 'learning') tally.learning += 1;
    else if (s === 'new') tally.new += 1;
  }
  return tally;
}

/** The persisted reading text: a UI preference, never learning data. */
export interface ReaderDoc {
  title: string;
  text: string;
}

/** Serializes with a fixed key order so the storage value is stable. */
export function serializeReaderDoc(doc: ReaderDoc): string {
  return JSON.stringify({ title: doc.title, text: doc.text });
}

/** Strict parser: returns null for anything that is not a clean doc. */
export function parseReaderDoc(raw: string): ReaderDoc | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    if (keys.length !== 2 || keys[0] !== 'text' || keys[1] !== 'title') return null;
    if (typeof rec.title !== 'string' || typeof rec.text !== 'string') return null;
    if (rec.title.length === 0 || rec.title.length > 120) return null;
    if (rec.text.trim().length === 0 || rec.text.length > 20000) return null;
    return { title: rec.title, text: rec.text };
  } catch {
    return null;
  }
}
