import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WORD_DEFS, WORD_PACK, WORD_COUNT } from '../src/content/word-pack.js';
import { GRAMMAR_PACK } from '../src/content/grammar-pack.js';
import { CURRICULUM, findUnitDef, unitTitle } from '../src/app/curriculum.js';
import { EXERCISE_BANK } from '../src/app/exercises.js';
import { buildProgressMap } from '../src/app/progress.js';
import { createClient } from '../src/kernel/index.js';

const ARABIC = /[\u0600-\u06FF]/;

describe('ELOS Milestones I1 + I3 - vocabulary packs (two batches)', () => {
  it('structure: 48 unique words (batch 1 + batch 2), valid pos, Arabic glosses, English examples containing the lemma exactly once', () => {
    assert.strictEqual(WORD_COUNT, 48);
    const ids = new Set<string>();
    for (const def of WORD_DEFS) {
      assert.ok(/^[a-z]+$/.test(def.id), `lemma must be lowercase letters: ${def.id}`);
      assert.ok(def.pos === 'noun' || def.pos === 'verb', `bad pos for ${def.id}`);
      assert.ok(ARABIC.test(def.gloss), `gloss must be Arabic for ${def.id}`);
      assert.ok(ARABIC.test(def.ar), `teaching line must be Arabic for ${def.id}`);
      assert.ok(ARABIC.test(def.mistake), `mistake note must be Arabic for ${def.id}`);
      assert.ok(def.en.length > 5, `English gloss too short for ${def.id}`);
      ids.add(def.id);

      // The example must contain the lemma exactly once, in base form.
      const matches = def.example.match(new RegExp(`\\b${def.id}\\b`, 'g'));
      assert.strictEqual(
        matches === null ? 0 : matches.length,
        1,
        `example for ${def.id} must contain the lemma exactly once: "${def.example}"`
      );
    }
    assert.strictEqual(ids.size, WORD_COUNT, 'lemmas must be unique');

    const nouns = WORD_DEFS.filter((w) => w.pos === 'noun').length;
    const verbs = WORD_DEFS.filter((w) => w.pos === 'verb').length;
    assert.ok(nouns >= 15 && verbs >= 5, `expected a noun-heavy batch, got ${nouns} nouns / ${verbs} verbs`);
  });

  it('units: one per word with word: ids, A1, no prerequisites, bilingual content', () => {
    assert.strictEqual(WORD_PACK.units.length, WORD_COUNT);
    for (const unit of WORD_PACK.units) {
      assert.ok(unit.id.startsWith('word:'));
      assert.strictEqual(unit.cefr, 'A1');
      assert.deepStrictEqual(unit.prerequisites, []);
      assert.ok(ARABIC.test(unit.summary_ar));
      assert.ok(ARABIC.test(unit.common_mistake_ar));
      assert.strictEqual(unit.examples.length, 1);
      assert.ok(unit.examples[0].length > 5);
    }
    const unitIds = new Set(WORD_PACK.units.map((u) => u.id));
    assert.strictEqual(unitIds.size, WORD_COUNT);
  });

  it('items: three per word, ids unique across BOTH packs, recognition answers inside their options', () => {
    assert.strictEqual(WORD_PACK.items.length, WORD_COUNT * 3);

    const grammarIds = new Set(GRAMMAR_PACK.items.map((i) => i.id));
    const seen = new Set<string>();
    for (const item of WORD_PACK.items) {
      assert.ok(!grammarIds.has(item.id), `item id collides with grammar pack: ${item.id}`);
      assert.ok(!seen.has(item.id), `duplicate item id: ${item.id}`);
      seen.add(item.id);
      assert.strictEqual(item.skill, 'vocabulary');
      assert.ok(item.note_en && item.note_en.length > 3, `note_en required for ${item.id}`);
      assert.strictEqual(item.unit_id.startsWith('word:'), true);
    }

    for (const def of WORD_DEFS) {
      const meaning = WORD_PACK.items.find((i) => i.id === `w-${def.id}-1`)!;
      assert.strictEqual(meaning.task_class, 'recognition_item');
      assert.strictEqual(meaning.prompt, `What does «${def.id}» mean?`);
      assert.strictEqual(meaning.answer, def.gloss);
      assert.ok(meaning.options!.includes(def.gloss));
      assert.strictEqual(new Set(meaning.options).size, 3, 'options must be unique');

      const fill = WORD_PACK.items.find((i) => i.id === `w-${def.id}-2`)!;
      assert.strictEqual(fill.task_class, 'recognition_item');
      assert.ok(fill.prompt.includes('___'), `fill prompt must have a blank: ${fill.prompt}`);
      assert.ok(
        !new RegExp(`\\b${def.id}\\b`).test(fill.prompt),
        `fill prompt must not contain the lemma: ${fill.prompt}`
      );
      assert.strictEqual(fill.answer, def.id);
      assert.ok(fill.options!.includes(def.id));
      // Distractors keep the same part of speech.
      const distractors = fill.options!.filter((o) => o !== def.id);
      for (const d of distractors) {
        const peer = WORD_DEFS.find((w) => w.id === d)!;
        assert.strictEqual(peer.pos, def.pos, `distractor ${d} must share the pos of ${def.id}`);
      }

      const typeIn = WORD_PACK.items.find((i) => i.id === `w-${def.id}-3`)!;
      assert.strictEqual(typeIn.task_class, 'controlled_recall');
      assert.ok(typeIn.prompt.startsWith('Type in English: '));
      assert.ok(ARABIC.test(typeIn.prompt));
      assert.strictEqual(typeIn.answer, def.id);
      assert.strictEqual(typeIn.options, undefined);
    }
  });

  it('merged curriculum: grammar and words interleaved, orders 0..N, lookups find both', () => {
    assert.strictEqual(CURRICULUM.length, GRAMMAR_PACK.units.length + WORD_COUNT);

    // Grammar units occupy the even slots in pack order; words the odd slots,
    // then the remaining words fill sequentially after the grammar pack ends.
    for (let i = 0; i < GRAMMAR_PACK.units.length; i++) {
      assert.strictEqual(CURRICULUM[2 * i].id, GRAMMAR_PACK.units[i].id);
    }
    for (let i = 0; i < WORD_COUNT; i++) {
      const wordIndex = i < GRAMMAR_PACK.units.length ? 2 * i + 1 : i + GRAMMAR_PACK.units.length;
      assert.strictEqual(CURRICULUM[wordIndex].id, WORD_PACK.units[i].id);
    }
    for (let i = 0; i < CURRICULUM.length; i++) {
      assert.strictEqual(CURRICULUM[i].order, i);
    }

    assert.strictEqual(unitTitle('word:book'), 'Word: book');
    const bookDef = findUnitDef('word:book');
    assert.ok(bookDef && ARABIC.test(bookDef.summary_ar));
    assert.strictEqual(findUnitDef('grammar:present-simple-s')!.title, 'Present simple: he/she/it + -s');
    assert.strictEqual(findUnitDef('word:nope'), undefined);
  });

  it('progress map: word units appear alongside grammar units with not-started state', () => {
    const map = buildProgressMap(createClient('dev-words'), '2026-01-01T10:00:00Z');
    const allUnits = map.flatMap((b) => b.units);
    assert.strictEqual(allUnits.length, CURRICULUM.length);

    const bookEntry = allUnits.find((u) => u.unit_id === 'word:book');
    if (!bookEntry) {
      assert.fail('word:book must appear in the progress map');
    }
    assert.strictEqual(bookEntry.title, 'Word: book');
    assert.strictEqual(bookEntry.state, 'unknown');
    assert.deepStrictEqual(bookEntry.due, { kind: 'not_started' });

    // Interleaved: word:book sits right after the first grammar unit.
    // A1 holds 2 grammar units (present-simple-s, articles-a-an) + all 48 words.
    const a1 = map.find((b) => b.band === 'A1')!;
    assert.strictEqual(a1.units.length, 50);
    assert.strictEqual(a1.units[0].unit_id, 'grammar:present-simple-s');
    assert.strictEqual(a1.units[1].unit_id, 'word:book');
  });

  it('exercise bank: grammar items first (unchanged), then word items; grammar events keep skill grammar', () => {
    assert.strictEqual(EXERCISE_BANK.length, GRAMMAR_PACK.items.length + WORD_COUNT * 3);
    for (let i = 0; i < GRAMMAR_PACK.items.length; i++) {
      assert.strictEqual(EXERCISE_BANK[i].id, GRAMMAR_PACK.items[i].id);
      assert.strictEqual(EXERCISE_BANK[i].skill, 'grammar');
    }
    const firstWordItem = EXERCISE_BANK[GRAMMAR_PACK.items.length];
    assert.strictEqual(firstWordItem.id, 'w-book-1');
    assert.strictEqual(firstWordItem.skill, 'vocabulary');
  });
});
