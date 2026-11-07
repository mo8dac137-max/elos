import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

/**
 * WP-2 follow-up (supervisor gate, adopted from the design partner's
 * advice): the reader's second, non-color channel for learning states
 * must never silently disappear under later visual polish. This test
 * parses the real CSS in index.html and enforces:
 *   1. the four state rules exist with their LOCKED text colors;
 *   2. their border-bottom-style values are pairwise DISTINCT;
 *   3. every border-bottom-color keeps >= 3:1 contrast on the card
 *      background #0d0d0d (WCAG non-text threshold);
 *   4. the underline is at least 3px wide (a 'double' border collapses
 *      into one line below 3px and loses the channel);
 *   5. the base .reader-word keeps the 48px touch target.
 * The specific style-to-state mapping stays a design decision: changing
 * it only requires this test to follow in the same commit.
 */

const CARD_BG = '#0d0d0d';
const LOCKED_TEXT: Record<string, string> = {
  known: '#55dd77',
  learning: '#e8c46b',
  new: '#7aa2ff',
  outside: '#d8d8d8',
};

function parseRule(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}

function declaration(block: string, prop: string): string | null {
  const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i');
  const m = block.match(re);
  return m ? m[1].trim().toLowerCase() : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (!/^[0-9a-f]{6}$/.test(full)) {
    throw new Error('not a hex color: ' + hex);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('ELOS reader state-channel guard - WP-2 follow-up', () => {
  const css = fs.readFileSync(
    path.join(process.cwd(), 'index.html'),
    'utf-8'
  );

  it('base .reader-word keeps the 48px touch target and a >=3px underline', () => {
    const base = parseRule(css, '.reader-word');
    assert.ok(base, '.reader-word rule is missing from index.html');
    const minHeight = declaration(base!, 'min-height');
    assert.ok(minHeight, '.reader-word must declare min-height');
    assert.ok(
      parseInt(minHeight!, 10) >= 48,
      `min-height fell below 48px: ${minHeight}`
    );
    // 'double' collapses to a single line under 3px, killing the channel.
    const borderBottom = declaration(base!, 'border-bottom');
    const borderWidth = declaration(base!, 'border-bottom-width');
    const widthSource = borderWidth ?? borderBottom;
    assert.ok(widthSource, '.reader-word must declare a border-bottom width');
    const px = widthSource!.match(/(\d+(?:\.\d+)?)px/);
    assert.ok(px, `border-bottom width is not in px: ${widthSource}`);
    assert.ok(
      parseFloat(px![1]) >= 3,
      `underline thinner than 3px breaks 'double': ${widthSource}`
    );
  });

  it('all four state rules exist with LOCKED text colors', () => {
    for (const state of Object.keys(LOCKED_TEXT)) {
      const block = parseRule(css, `.reader-word.reader-${state}`);
      assert.ok(block, `.reader-word.reader-${state} rule is missing`);
      const color = declaration(block!, 'color');
      assert.strictEqual(
        color,
        LOCKED_TEXT[state].toLowerCase(),
        `reader-${state} text color changed (LOCKED)`
      );
    }
  });

  it('the four border-bottom styles are pairwise distinct (non-color channel)', () => {
    const styles: Record<string, string> = {};
    for (const state of Object.keys(LOCKED_TEXT)) {
      const block = parseRule(css, `.reader-word.reader-${state}`);
      assert.ok(block, `.reader-word.reader-${state} rule is missing`);
      const style = declaration(block!, 'border-bottom-style');
      assert.ok(
        style,
        `reader-${state} lost its border-bottom-style (the non-color channel)`
      );
      styles[state] = style!;
    }
    const values = Object.values(styles);
    assert.strictEqual(
      new Set(values).size,
      values.length,
      `state underline styles are no longer pairwise distinct: ${JSON.stringify(styles)}`
    );
  });

  it('every state underline keeps >= 3:1 contrast on the card background', () => {
    for (const state of Object.keys(LOCKED_TEXT)) {
      const block = parseRule(css, `.reader-word.reader-${state}`);
      assert.ok(block, `.reader-word.reader-${state} rule is missing`);
      const borderColor = declaration(block!, 'border-bottom-color');
      assert.ok(
        borderColor,
        `reader-${state} lost its border-bottom-color`
      );
      const ratio = contrast(borderColor!, CARD_BG);
      assert.ok(
        ratio >= 3,
        `reader-${state} underline contrast on ${CARD_BG} is ${ratio.toFixed(2)}:1 (< 3:1)`
      );
    }
  });
});
