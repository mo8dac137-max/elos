import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import {
  FreeDictionaryProvider,
  normalizeDictResponse,
  FREE_DICTIONARY_BASE,
  DictFetch,
} from '../src/dict/provider.js';
import { MemoryDictCache } from '../src/dict/cache.js';
import type { DictEntry } from '../src/dict/types.js';

/**
 * A trimmed but structurally REAL response from
 * https://api.dictionaryapi.dev/api/v2/entries/en/book (captured live
 * 2026-11-04): two phonetics with https audio, one noun meaning whose
 * definitions carry examples.
 */
const realBookResponse = [
  {
    word: 'book',
    phonetic: '/buːk/',
    phonetics: [
      {
        text: '/buːk/',
        audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/book-us.mp3',
        sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=380110',
      },
      {
        text: '/buːk/',
        audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/book-uk.mp3',
        sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=9014290',
        license: { name: 'BY 3.0 US', url: 'https://creativecommons.org/licenses/by/3.0/us' },
      },
    ],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          {
            definition:
              'A collection of sheets of paper bound together to hinge at one edge, containing printed or written material, pictures, etc.',
            synonyms: [],
            antonyms: [],
            example:
              "He was frustrated because he couldn't find anything about dinosaurs in the book.",
          },
          {
            definition:
              'A long work fit for publication, typically prose, such as a novel or textbook.',
            synonyms: [],
            antonyms: [],
            example: 'I have three copies of his first book.',
          },
        ],
      },
    ],
  },
];

function res(status: number, body: unknown): { ok: boolean; status: number; json(): Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('ELOS Milestone I2 - dictionary normalizer', () => {
  it('normalizes the real book response deterministically', () => {
    const entry = normalizeDictResponse(realBookResponse, 'book', '2026-11-04T00:00:00.000Z');
    assert.notStrictEqual(entry, null);
    assert.strictEqual(entry!.word, 'book');
    assert.strictEqual(entry!.phonetic, '/buːk/');
    assert.strictEqual(
      entry!.audioUrl,
      'https://api.dictionaryapi.dev/media/pronunciations/en/book-us.mp3'
    );
    assert.strictEqual(entry!.fetched_at, '2026-11-04T00:00:00.000Z');
    assert.strictEqual(entry!.meanings.length, 1);
    assert.strictEqual(entry!.meanings[0].partOfSpeech, 'noun');
    assert.strictEqual(entry!.meanings[0].definitions.length, 2);
    assert.strictEqual(
      entry!.meanings[0].definitions[0].example,
      "He was frustrated because he couldn't find anything about dinosaurs in the book."
    );
  });

  it('matches the word case-insensitively and lowercases the output word', () => {
    const entry = normalizeDictResponse(realBookResponse, 'Book', '2026-11-04T00:00:00.000Z');
    assert.notStrictEqual(entry, null);
    assert.strictEqual(entry!.word, 'book');
  });

  it('rejects responses whose entries describe a different word', () => {
    const entry = normalizeDictResponse(realBookResponse, 'water', '2026-11-04T00:00:00.000Z');
    assert.strictEqual(entry, null);
  });

  it('rejects non-arrays, empty arrays and responses without usable meanings', () => {
    assert.strictEqual(normalizeDictResponse({}, 'book', 'x'), null);
    assert.strictEqual(normalizeDictResponse([], 'book', 'x'), null);
    assert.strictEqual(
      normalizeDictResponse([{ word: 'book', phonetics: [], meanings: [] }], 'book', 'x'),
      null
    );
    assert.strictEqual(
      normalizeDictResponse(
        [{ word: 'book', phonetics: [], meanings: [{ partOfSpeech: 'noun', definitions: [] }] }],
        'book',
        'x'
      ),
      null
    );
  });

  it('caps meanings at 4 parts of speech and 3 definitions per part of speech', () => {
    const meaning = (pos: string, defs: number) => ({
      partOfSpeech: pos,
      definitions: Array.from({ length: defs }, (_, i) => ({
        definition: `Sense ${i + 1} of ${pos}.`,
        example: null,
      })),
    });
    const raw = [
      {
        word: 'test',
        phonetics: [],
        meanings: [meaning('noun', 9), meaning('verb', 5), meaning('adjective', 2), meaning('adverb', 1), meaning('pronoun', 1)],
      },
    ];
    const entry = normalizeDictResponse(raw, 'test', 'x');
    assert.notStrictEqual(entry, null);
    assert.strictEqual(entry!.meanings.length, 4);
    assert.strictEqual(entry!.meanings[0].definitions.length, 3);
    assert.strictEqual(entry!.meanings[1].definitions.length, 3);
    assert.strictEqual(entry!.meanings[3].definitions.length, 1);
    assert.ok(!entry!.meanings.some((m) => m.partOfSpeech === 'pronoun'));
  });

  it('falls back to phonetics[].text when the top-level phonetic is missing, and only accepts https audio', () => {
    const raw = [
      {
        word: 'x',
        phonetic: '',
        phonetics: [
          { text: '/eks/', audio: 'http://insecure.example/x.mp3' },
          { text: '', audio: 'javascript:alert(1)' },
        ],
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'The letter x.' }] }],
      },
    ];
    const entry = normalizeDictResponse(raw, 'x', 'x');
    assert.notStrictEqual(entry, null);
    assert.strictEqual(entry!.phonetic, '/eks/');
    assert.strictEqual(entry!.audioUrl, null);
  });

  it('skips malformed entries, oversized strings and non-record junk instead of failing', () => {
    const raw = [
      'junk',
      null,
      { word: 'x', phonetics: 'not-an-array', meanings: [{ partOfSpeech: '', definitions: [{ definition: 'd' }] }, 'junk', { partOfSpeech: 'noun', definitions: [{ definition: 'y'.repeat(801) }, { definition: 'Valid.' }] }] },
    ];
    const entry = normalizeDictResponse(raw, 'x', 'x');
    assert.notStrictEqual(entry, null);
    assert.strictEqual(entry!.meanings.length, 1);
    assert.strictEqual(entry!.meanings[0].definitions.length, 1);
    assert.strictEqual(entry!.meanings[0].definitions[0].definition, 'Valid.');
  });
});

describe('ELOS Milestone I2 - FreeDictionaryProvider lookup', () => {
  it('returns ok with a normalized entry and hits the documented endpoint', async () => {
    const urls: string[] = [];
    const fetchImpl: DictFetch = async (url, init) => {
      urls.push(url);
      assert.ok(init.signal instanceof AbortSignal, 'the request is bounded by an abort signal');
      return res(200, realBookResponse);
    };
    const provider = new FreeDictionaryProvider(fetchImpl);
    const outcome = await provider.lookup('book');
    assert.strictEqual(outcome.status, 'ok');
    assert.deepStrictEqual(urls, [FREE_DICTIONARY_BASE + 'book']);
    if (outcome.status === 'ok') {
      assert.strictEqual(outcome.entry.word, 'book');
      assert.ok(outcome.entry.fetched_at.length > 0);
    }
  });

  it('maps 404 to not_found and other HTTP failures to http_NNN', async () => {
    const p404 = new FreeDictionaryProvider(async () => res(404, { title: 'No Definitions Found' }));
    assert.deepStrictEqual(await p404.lookup('xxqqzz'), { status: 'not_found' });

    const p500 = new FreeDictionaryProvider(async () => res(500, 'oops'));
    assert.deepStrictEqual(await p500.lookup('book'), { status: 'error', message: 'http_500' });
  });

  it('maps unparseable bodies to bad_response and unusable bodies to bad_output', async () => {
    const pBad = new FreeDictionaryProvider(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    }));
    assert.deepStrictEqual(await pBad.lookup('book'), { status: 'error', message: 'bad_response' });

    const pGarbage = new FreeDictionaryProvider(async () => res(200, { nope: true }));
    assert.deepStrictEqual(await pGarbage.lookup('book'), { status: 'error', message: 'bad_output' });
  });

  it('maps network failure to offline', async () => {
    const p = new FreeDictionaryProvider(async () => {
      throw new TypeError('fetch failed');
    });
    assert.deepStrictEqual(await p.lookup('book'), { status: 'offline' });
  });

  it('aborts a hanging request and maps it to timeout', async () => {
    const fetchImpl: DictFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    const provider = new FreeDictionaryProvider(fetchImpl, 50);
    assert.deepStrictEqual(await provider.lookup('book'), { status: 'error', message: 'timeout' });
  });

  it('invokes the injected fetch WITHOUT a receiver (a bound global fetch throws Illegal invocation)', async () => {
    // A plain (non-arrow) function mimics the real global fetch: Chromium
    // rejects it with "Illegal invocation" when called with a this-binding.
    const realLikeFetch = function (this: unknown, _url: string, _init: { signal?: AbortSignal }) {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(res(200, realBookResponse));
    } as DictFetch;
    const provider = new FreeDictionaryProvider(realLikeFetch);
    const outcome = await provider.lookup('book');
    assert.strictEqual(outcome.status, 'ok');
  });
});

describe('ELOS Milestone I2 - dictionary cache', () => {
  it('MemoryDictCache round-trips an entry under a lowercase key', async () => {
    const cache = new MemoryDictCache();
    assert.strictEqual(await cache.get('Book'), null);
    const entry: DictEntry = {
      word: 'book',
      phonetic: '/buːk/',
      audioUrl: null,
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A thing you read.', example: null }] }],
      fetched_at: '2026-11-04T00:00:00.000Z',
    };
    await cache.put('Book', entry);
    const hit = await cache.get('book');
    assert.deepStrictEqual(hit, entry);
    assert.deepStrictEqual(await cache.get('BOOK'), entry);
  });

  it('cache layer and UI wiring statics: separate DB, word-only section, no secrets', () => {
    const cachePath = path.join(process.cwd(), 'src', 'dict', 'cache.ts');
    const cache = fs.readFileSync(cachePath, 'utf-8');
    assert.ok(cache.includes("'elos-dict'"), 'dictionary cache uses its own IndexedDB database');
    assert.ok(!cache.includes('client_state'), 'never touches the learner-state key');

    const sectionPath = path.join(process.cwd(), 'src', 'ui', 'screens', 'dictSection.ts');
    const section = fs.readFileSync(sectionPath, 'utf-8');
    assert.ok(section.includes("startsWith('word:')"), 'the section renders for word units only');
    assert.ok(section.includes('cache.get(word)'), 'cache is read before any network call');
    assert.ok(section.includes('cache.put(word, outcome.entry)'), 'successful lookups are cached');
    assert.ok(section.includes('Play audio'), 'pronunciation playback is offered');
    assert.ok(section.includes('Free Dictionary API'), 'the source is attributed');

    const cardPath = path.join(process.cwd(), 'src', 'ui', 'screens', 'unitCard.ts');
    const card = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(card.includes('deps.dictSection'), 'the unit card mounts the dictionary section');

    const mainPath = path.join(process.cwd(), 'src', 'ui', 'main.ts');
    const main = fs.readFileSync(mainPath, 'utf-8');
    assert.ok(
      main.includes('createDictSection(unitDef.id)'),
      'main wires the dictionary section into the unit card'
    );

    for (const f of ['src/dict/provider.ts', 'src/dict/cache.ts', 'src/dict/types.ts']) {
      const content = fs.readFileSync(path.join(process.cwd(), f), 'utf-8');
      assert.ok(!content.includes('AIza'), `${f} contains no Google API key`);
      assert.ok(!content.includes('sb_secret'), `${f} contains no Supabase secret`);
      assert.ok(!/[A-Za-z0-9]{32,}/.test(content), `${f} contains no key-like token blob`);
    }
  });

  it('createDictSection returns null for grammar units (no DOM needed for the guard)', async () => {
    const { createDictSection } = await import('../src/ui/screens/dictSection.js');
    assert.strictEqual(createDictSection('grammar:present-simple-s'), null);
  });
});
