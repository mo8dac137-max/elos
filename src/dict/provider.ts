import type { DictDefinition, DictEntry, DictMeaning, DictOutcome } from './types.js';

/**
 * Milestone I2: the dictionary provider layer. The first provider is the
 * keyless Free Dictionary API (dictionaryapi.dev): CORS-open for browsers
 * ("access-control-allow-origin: *", verified live 2026-11-04) and limited
 * to about 450 requests per rate window — with the permanent local cache
 * the app makes at most ONE request per word, ever. No key exists, so
 * nothing secret can leak through this layer.
 */

export type DictFetch = (
  url: string,
  init: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface DictProvider {
  lookup(word: string): Promise<DictOutcome>;
}

export const FREE_DICTIONARY_BASE =
  'https://api.dictionaryapi.dev/api/v2/entries/en/';

/** Default network bound: a slow provider must never hang the word card. */
export const DICT_TIMEOUT_MS = 10000;

/** Hard caps so a hostile or broken response can never flood the card. */
const MAX_MEANINGS = 4;
const MAX_DEFINITIONS_PER_MEANING = 3;
const MAX_DEFINITION_CHARS = 800;
const MAX_EXAMPLE_CHARS = 300;
const MAX_POS_CHARS = 40;
const MAX_PHONETIC_CHARS = 60;
const MAX_AUDIO_CHARS = 300;

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Pure, deterministic normalization of one raw provider response into a
 * DictEntry. Returns null when the response does not strictly describe the
 * requested word (the caller maps that to bad_output). The clock is
 * injected: fetched_at comes from the caller, never from inside.
 */
export function normalizeDictResponse(
  raw: unknown,
  word: string,
  fetchedAtIso: string
): DictEntry | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  let chosen: Record<string, unknown> | null = null;
  for (const candidate of raw) {
    if (
      isRecord(candidate) &&
      typeof candidate.word === 'string' &&
      candidate.word.toLowerCase() === word.toLowerCase()
    ) {
      chosen = candidate;
      break;
    }
  }
  if (chosen === null) return null;

  const phonetics = Array.isArray(chosen.phonetics) ? chosen.phonetics : [];
  let phonetic: string | null = null;
  if (isNonEmptyString(chosen.phonetic, MAX_PHONETIC_CHARS)) {
    phonetic = chosen.phonetic;
  } else {
    for (const p of phonetics) {
      if (isRecord(p) && isNonEmptyString(p.text, MAX_PHONETIC_CHARS)) {
        phonetic = p.text;
        break;
      }
    }
  }

  let audioUrl: string | null = null;
  for (const p of phonetics) {
    if (
      isRecord(p) &&
      typeof p.audio === 'string' &&
      p.audio.startsWith('https://') &&
      p.audio.length <= MAX_AUDIO_CHARS
    ) {
      audioUrl = p.audio;
      break;
    }
  }

  const rawMeanings = Array.isArray(chosen.meanings) ? chosen.meanings : [];
  const meanings: DictMeaning[] = [];
  for (const m of rawMeanings) {
    if (meanings.length >= MAX_MEANINGS) break;
    if (!isRecord(m) || !isNonEmptyString(m.partOfSpeech, MAX_POS_CHARS)) continue;
    const rawDefs = Array.isArray(m.definitions) ? m.definitions : [];
    const defs: DictDefinition[] = [];
    for (const d of rawDefs) {
      if (defs.length >= MAX_DEFINITIONS_PER_MEANING) break;
      if (!isRecord(d) || !isNonEmptyString(d.definition, MAX_DEFINITION_CHARS)) continue;
      defs.push({
        definition: d.definition,
        example: isNonEmptyString(d.example, MAX_EXAMPLE_CHARS) ? d.example : null,
      });
    }
    if (defs.length > 0) {
      meanings.push({ partOfSpeech: m.partOfSpeech, definitions: defs });
    }
  }
  if (meanings.length === 0) return null;

  return {
    word: word.toLowerCase(),
    phonetic,
    audioUrl,
    meanings,
    fetched_at: fetchedAtIso,
  };
}

/** The Free Dictionary API provider: one bounded GET, deterministic mapping. */
export class FreeDictionaryProvider implements DictProvider {
  constructor(
    private readonly fetchImpl: DictFetch,
    private readonly timeoutMs: number = DICT_TIMEOUT_MS
  ) {}

  async lookup(word: string): Promise<DictOutcome> {
    const url = FREE_DICTIONARY_BASE + encodeURIComponent(word);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Destructured so a bare global `fetch` is invoked without a receiver:
    // `this.fetchImpl(...)` would call it with `this` = this provider and
    // Chromium rejects that with "Illegal invocation".
    const doFetch = this.fetchImpl;
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      res = await doFetch(url, { signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        return { status: 'error', message: 'timeout' };
      }
      return { status: 'offline' };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'error', message: 'http_' + res.status };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { status: 'error', message: 'bad_response' };
    }

    const entry = normalizeDictResponse(body, word, new Date().toISOString());
    if (entry === null) return { status: 'error', message: 'bad_output' };
    return { status: 'ok', entry };
  }
}
