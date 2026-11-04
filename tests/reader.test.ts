import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createClient, deriveFromClient } from '../src/kernel/index.js';
import { EXERCISE_BANK, submitAnswer } from '../src/app/index.js';
import {
  countTokenStates,
  deriveReaderStates,
  normalizeForPack,
  parseReaderDoc,
  readerStateFor,
  serializeReaderDoc,
  tokenizeText,
  wordKey,
} from '../src/app/reader.js';
import { WORD_PACK } from '../src/content/word-pack.js';
import { READER_TEXTS } from '../src/content/reader-texts.js';

const ctx = (() => {
  let timeMs = 1767264000000;
  let idSeq = 0;
  return {
    now: () => new Date(timeMs++).toISOString(),
    newId: () => `ev-${++idSeq}`,
  };
})();

function wordItem(id: string) {
  const item = EXERCISE_BANK.find((i) => i.id === id);
  if (!item) throw new Error(`missing exercise ${id}`);
  return item;
}

describe('ELOS Milestone J1 - reader tokenization', () => {
  it('wordKey: lowercases, trims non-letter edges, keeps inner apostrophes, folds curly ones', () => {
    assert.strictEqual(wordKey('Book.'), 'book');
    assert.strictEqual(wordKey('"phone",'), 'phone');
    assert.strictEqual(wordKey('(medicine)'), 'medicine');
    assert.strictEqual(wordKey('don\u2019t'), "don't");
    assert.strictEqual(wordKey("don't"), "don't");
    assert.strictEqual(wordKey('It\u2019s'), "it's");
    assert.strictEqual(wordKey('1993'), null);
    assert.strictEqual(wordKey('\u2014'), null);
    assert.strictEqual(wordKey('\u0643\u062A\u0627\u0628'), null);
    assert.strictEqual(wordKey('...'), null);
  });

  it('normalizeForPack: conservative regular-suffix stripping only', () => {
    assert.strictEqual(normalizeForPack('works'), 'work');
    assert.strictEqual(normalizeForPack('reads'), 'read');
    assert.strictEqual(normalizeForPack('buys'), 'buy');
    assert.strictEqual(normalizeForPack('goes'), 'go');
    assert.strictEqual(normalizeForPack('watches'), 'watch');
    assert.strictEqual(normalizeForPack('classes'), 'class');
    assert.strictEqual(normalizeForPack('cities'), 'city');
    assert.strictEqual(normalizeForPack('needed'), 'need');
    assert.strictEqual(normalizeForPack('helped'), 'help');
    assert.strictEqual(normalizeForPack('people'), 'people');
    assert.strictEqual(normalizeForPack('class'), 'class');
    assert.strictEqual(normalizeForPack('less'), 'less');
    assert.strictEqual(normalizeForPack('has'), 'has');
    assert.strictEqual(normalizeForPack('is'), 'is');
    assert.strictEqual(normalizeForPack('medicine'), 'medicine');
    assert.strictEqual(normalizeForPack('morning'), 'morning');
    assert.strictEqual(normalizeForPack('reading'), 'reading');
    assert.strictEqual(normalizeForPack('went'), 'went');
    assert.strictEqual(normalizeForPack('children'), 'children');
  });

  it('tokenizeText: splits on whitespace, pairs raw with keys, never empty', () => {
    const tokens = tokenizeText('Sara works in a pharmacy.\n\nShe reads: "go!"');
    assert.deepStrictEqual(
      tokens.map((t) => t.raw),
      ['Sara', 'works', 'in', 'a', 'pharmacy.', 'She', 'reads:', '"go!"']
    );
    assert.strictEqual(tokens[0].key, 'sara');
    assert.strictEqual(tokens[1].key, 'work');
    assert.strictEqual(tokens[4].key, 'pharmacy');
    assert.strictEqual(tokens[7].key, 'go');
    assert.ok(tokens.every((t) => t.raw.length > 0));
    assert.deepStrictEqual(tokenizeText(''), []);
    assert.deepStrictEqual(tokenizeText('   \n\t '), []);
    // dictKey stays unnormalized even when the pack key is normalized.
    assert.strictEqual(tokens[1].dictKey, 'works');
  });

  it('number and Arabic tokens keep raw text but have null keys', () => {
    const tokens = tokenizeText('I have 2 \u0643\u062A\u0627\u0628.');
    assert.strictEqual(tokens.length, 4);
    assert.strictEqual(tokens[2].raw, '2');
    assert.strictEqual(tokens[2].key, null);
    assert.strictEqual(tokens[3].key, null);
  });
});

describe('ELOS Milestone J1 - reader state mapping', () => {
  it('readerStateFor maps the whole kernel ladder; unknown values stay outside', () => {
    assert.strictEqual(readerStateFor('unknown'), 'new');
    assert.strictEqual(readerStateFor('exposure'), 'learning');
    assert.strictEqual(readerStateFor('recognition'), 'learning');
    assert.strictEqual(readerStateFor('controlled'), 'known');
    assert.strictEqual(readerStateFor('guided'), 'known');
    assert.strictEqual(readerStateFor('spontaneous'), 'known');
    assert.strictEqual(readerStateFor('mastery'), 'known');
    assert.strictEqual(readerStateFor(undefined), 'outside');
    assert.strictEqual(readerStateFor('anything-else'), 'outside');
  });

  it('deriveReaderStates covers every word unit and a fresh client is all new', () => {
    const client = createClient('dev-reader-1');
    const states = deriveReaderStates(client);
    assert.strictEqual(states.size, WORD_PACK.units.length);
    for (const unit of WORD_PACK.units) {
      const word = unit.id.slice('word:'.length);
      assert.strictEqual(states.get(word), 'new');
    }
  });

  it('deriveReaderStates follows real evidence: two correct answers move book to learning, a correct recall to known', () => {
    let client = createClient('dev-reader-2');
    const r1 = submitAnswer(client, wordItem('w-book-1'), wordItem('w-book-1').answer, ctx);
    client = r1.state;
    assert.strictEqual(deriveReaderStates(client).get('book'), 'learning');

    const r2 = submitAnswer(client, wordItem('w-book-2'), wordItem('w-book-2').answer, ctx);
    client = r2.state;
    assert.strictEqual(deriveFromClient(client, 'word:book', { minDelayMs: 60000 }).state, 'recognition');
    assert.strictEqual(deriveReaderStates(client).get('book'), 'learning');

    const r3 = submitAnswer(client, wordItem('w-book-3'), wordItem('w-book-3').answer, ctx);
    client = r3.state;
    assert.strictEqual(deriveReaderStates(client).get('book'), 'known');
    assert.strictEqual(deriveReaderStates(client).get('water'), 'new');
  });

  it('countTokenStates tallies word tokens by derived state', () => {
    const client = createClient('dev-reader-3');
    const states = deriveReaderStates(client);
    const tally = countTokenStates(tokenizeText('The book and the water are here, book!'), states);
    assert.strictEqual(tally.words, 8);
    assert.strictEqual(tally.known, 0);
    assert.strictEqual(tally.learning, 0);
    assert.strictEqual(tally.new, 3);
  });
});

describe('ELOS Milestone J1 - reader document persistence format', () => {
  it('serializes with a fixed key order and parses back exactly', () => {
    const doc = { title: 'My text', text: 'Sara works.' };
    const raw = serializeReaderDoc(doc);
    assert.strictEqual(raw, '{"title":"My text","text":"Sara works."}');
    assert.deepStrictEqual(parseReaderDoc(raw), doc);
  });

  it('parseReaderDoc rejects garbage, wrong shapes, and oversized text', () => {
    assert.strictEqual(parseReaderDoc('not json'), null);
    assert.strictEqual(parseReaderDoc('42'), null);
    assert.strictEqual(parseReaderDoc('{"title":"x"}'), null);
    assert.strictEqual(parseReaderDoc('{"title":"x","text":""}'), null);
    assert.strictEqual(parseReaderDoc('{"title":"","text":"abc"}'), null);
    assert.strictEqual(parseReaderDoc('{"title":"x","text":"abc","extra":1}'), null);
    assert.strictEqual(parseReaderDoc('{"title":5,"text":"abc"}'), null);
    assert.deepStrictEqual(parseReaderDoc('{"text":"abc","title":"x"}'), { title: 'x', text: 'abc' });
    assert.strictEqual(parseReaderDoc(serializeReaderDoc({ title: 't', text: ' '.repeat(20001) })), null);
  });
});

describe('ELOS Milestone J1 - the curated reading texts', () => {
  it('ships four unique A1 texts, long enough to read', () => {
    assert.strictEqual(READER_TEXTS.length, 4);
    const ids = new Set(READER_TEXTS.map((t) => t.id));
    assert.strictEqual(ids.size, READER_TEXTS.length);
    for (const text of READER_TEXTS) {
      const tokens = tokenizeText(text.text);
      const words = tokens.filter((t) => t.key !== null);
      assert.ok(words.length >= 40, `${text.id}: too short (${words.length} words)`);
    }
  });

  it('every text leans on the curriculum: at least 10 word-unit matches', () => {
    const packWords = new Set(WORD_PACK.units.map((u) => u.id.slice('word:'.length)));
    for (const text of READER_TEXTS) {
      const matches = tokenizeText(text.text).filter(
        (t) => t.key !== null && packWords.has(t.key)
      );
      assert.ok(
        matches.length >= 10,
        `${text.id}: only ${matches.length} curriculum words`
      );
    }
  });

  it('texts are plain ASCII letters/punctuation (no curly quotes or exotic characters)', () => {
    for (const text of READER_TEXTS) {
      assert.ok(!/[\u2018\u2019\u201C\u201D]/.test(text.title + text.text), text.id);
      // eslint-disable-next-line no-control-regex
      assert.ok(/^[\x20-\x7E\n]+$/.test(text.text), text.id);
    }
  });

  it('tokenizer keys are clean lowercase for every token of every text', () => {
    for (const text of READER_TEXTS) {
      for (const token of tokenizeText(text.text)) {
        if (token.key !== null) {
          assert.match(token.key, /^[a-z']+$/, `${text.id}: ${token.raw}`);
        }
        if (token.dictKey !== null) {
          assert.match(token.dictKey, /^[a-z']+$/, `${text.id}: ${token.raw}`);
        }
      }
    }
  });
});
