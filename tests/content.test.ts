import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GRAMMAR_PACK } from '../src/content/grammar-pack.js';
import type { CefrBand, ItemDef } from '../src/content/types.js';

const EXPECTED_GO_ITEMS: ItemDef[] = [
  { id: 'r1', unit_id: 'grammar:go-went-gone', task_class: 'recognition_item', context_id: 'home', prompt: 'She has already ___ home.', options: ['went', 'gone', 'go'], answer: 'gone' },
  { id: 'r2', unit_id: 'grammar:go-went-gone', task_class: 'recognition_item', context_id: 'market', prompt: 'Yesterday we ___ to the market.', options: ['gone', 'went', 'go'], answer: 'went' },
  { id: 'r3', unit_id: 'grammar:go-went-gone', task_class: 'recognition_item', context_id: 'school', prompt: 'They have ___ to school.', options: ['went', 'gone', 'go'], answer: 'gone' },
  { id: 'r4', unit_id: 'grammar:go-went-gone', task_class: 'recognition_item', context_id: 'gym', prompt: 'Last week I ___ to the gym every morning.', options: ['go', 'went', 'gone'], answer: 'went' },
  { id: 'c1', unit_id: 'grammar:go-went-gone', task_class: 'controlled_recall', context_id: 'out', prompt: 'He has ___ out. (go)', answer: 'gone' },
  { id: 'c2', unit_id: 'grammar:go-went-gone', task_class: 'controlled_recall', context_id: 'night', prompt: 'Last night I ___ to bed early. (go)', answer: 'went' },
  { id: 'c3', unit_id: 'grammar:go-went-gone', task_class: 'controlled_recall', context_id: 'work', prompt: 'My brother has ___ to work. (go)', answer: 'gone' },
  { id: 'c4', unit_id: 'grammar:go-went-gone', task_class: 'controlled_recall', context_id: 'bus', prompt: 'I ___ to school by bus yesterday. (go)', answer: 'went' },
];

const VALID_CEFR_BANDS: Set<CefrBand> = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);

describe('Grammar Pack Content Validation', () => {
  it('unit ids and item ids are unique', () => {
    const unitIds = GRAMMAR_PACK.units.map((u) => u.id);
    assert.strictEqual(new Set(unitIds).size, unitIds.length, 'Unit IDs must be unique');

    const itemIds = GRAMMAR_PACK.items.map((i) => i.id);
    assert.strictEqual(new Set(itemIds).size, itemIds.length, 'Item IDs must be unique');
  });

  it('every item points to an existing unit', () => {
    const unitIds = new Set(GRAMMAR_PACK.units.map((u) => u.id));
    for (const item of GRAMMAR_PACK.items) {
      assert.ok(unitIds.has(item.unit_id), `Item ${item.id} points to non-existent unit ${item.unit_id}`);
    }
  });

  it('every unit has exactly 4 recognition_item and 4 controlled_recall items', () => {
    for (const unit of GRAMMAR_PACK.units) {
      const unitItems = GRAMMAR_PACK.items.filter((i) => i.unit_id === unit.id);
      const recognitionItems = unitItems.filter((i) => i.task_class === 'recognition_item');
      const controlledItems = unitItems.filter((i) => i.task_class === 'controlled_recall');

      assert.strictEqual(
        recognitionItems.length,
        4,
        `Unit ${unit.id} must have exactly 4 recognition items, found ${recognitionItems.length}`
      );
      assert.strictEqual(
        controlledItems.length,
        4,
        `Unit ${unit.id} must have exactly 4 controlled recall items, found ${controlledItems.length}`
      );
      assert.strictEqual(
        unitItems.length,
        8,
        `Unit ${unit.id} must have exactly 8 items in total, found ${unitItems.length}`
      );
    }
  });

  it('every recognition item has at least 2 unique options and its answer is one of them', () => {
    const recognitionItems = GRAMMAR_PACK.items.filter((i) => i.task_class === 'recognition_item');
    for (const item of recognitionItems) {
      assert.ok(Array.isArray(item.options), `Recognition item ${item.id} must have options array`);
      const options = item.options!;
      assert.ok(
        options.length >= 2,
        `Recognition item ${item.id} must have at least 2 options, found ${options.length}`
      );
      assert.strictEqual(
        new Set(options).size,
        options.length,
        `Recognition item ${item.id} options must be unique`
      );
      assert.ok(
        options.includes(item.answer),
        `Recognition item ${item.id} answer "${item.answer}" must be in options [${options.join(', ')}]`
      );
    }
  });

  it('controlled_recall items have no options', () => {
    const controlledItems = GRAMMAR_PACK.items.filter((i) => i.task_class === 'controlled_recall');
    for (const item of controlledItems) {
      assert.strictEqual(
        item.options,
        undefined,
        `Controlled recall item ${item.id} must have no options`
      );
    }
  });

  it('every prompt contains "___"', () => {
    for (const item of GRAMMAR_PACK.items) {
      assert.ok(
        item.prompt.includes('___'),
        `Item ${item.id} prompt "${item.prompt}" must contain "___"`
      );
    }
  });

  it('prerequisites exist and come earlier in the unit list', () => {
    const seenUnitIds = new Set<string>();
    const allUnitIds = new Set(GRAMMAR_PACK.units.map((u) => u.id));

    for (const unit of GRAMMAR_PACK.units) {
      for (const prereq of unit.prerequisites) {
        assert.ok(
          allUnitIds.has(prereq),
          `Unit ${unit.id} prerequisite ${prereq} does not exist in unit list`
        );
        assert.ok(
          seenUnitIds.has(prereq),
          `Unit ${unit.id} prerequisite ${prereq} must come earlier in the unit list`
        );
      }
      seenUnitIds.add(unit.id);
    }
  });

  it('cefr values valid', () => {
    for (const unit of GRAMMAR_PACK.units) {
      assert.ok(
        VALID_CEFR_BANDS.has(unit.cefr),
        `Unit ${unit.id} has invalid CEFR band: ${unit.cefr}`
      );
    }
  });

  it('the original 8 go/went/gone items equal a literal copy kept inside the test', () => {
    const goItems = GRAMMAR_PACK.items.filter((i) => i.unit_id === 'grammar:go-went-gone');
    assert.strictEqual(goItems.length, 8);

    for (let idx = 0; idx < EXPECTED_GO_ITEMS.length; idx++) {
      const expected = EXPECTED_GO_ITEMS[idx];
      const actual = goItems[idx];
      assert.strictEqual(actual.id, expected.id);
      assert.strictEqual(actual.unit_id, expected.unit_id);
      assert.strictEqual(actual.task_class, expected.task_class);
      assert.strictEqual(actual.context_id, expected.context_id);
      assert.strictEqual(actual.prompt, expected.prompt);
      assert.deepStrictEqual(actual.options, expected.options);
      assert.strictEqual(actual.answer, expected.answer);
    }
  });
});
