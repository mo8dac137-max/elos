/**
 * Milestone I2: dictionary types. External dictionary providers are
 * replaceable sources behind one interface (handoff 5.3); every response
 * is normalized into a DictEntry and cached locally forever (one network
 * call per word, ever). Dictionary data is reference content only: it
 * never becomes learning evidence and never touches the kernel.
 */

export interface DictDefinition {
  /** The English definition text, hard-capped in length by the normalizer. */
  definition: string;
  /** A usage example for this sense, when the provider supplies one. */
  example: string | null;
}

export interface DictMeaning {
  /** Part of speech, e.g. "noun" or "verb". */
  partOfSpeech: string;
  /** Up to 3 definitions for this part of speech. */
  definitions: DictDefinition[];
}

export interface DictEntry {
  /** The lowercase lemma this entry describes. */
  word: string;
  /** The IPA transcription, when known. */
  phonetic: string | null;
  /** An https audio URL for pronunciation, when known. */
  audioUrl: string | null;
  /** Up to 4 parts of speech. */
  meanings: DictMeaning[];
  /** ISO timestamp of the successful lookup (the cache never expires). */
  fetched_at: string;
}

export type DictOutcome =
  | { status: 'ok'; entry: DictEntry }
  | { status: 'not_found' }
  | { status: 'offline' }
  | { status: 'error'; message: string };
