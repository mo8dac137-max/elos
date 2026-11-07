import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

/**
 * WP-1 follow-up (supervisor gate, adopted from the design partner's
 * advice): element.style usage inside src/ui/screens/ is frozen at the
 * baseline below and may only go DOWN. index.html is the single styling
 * reference for screens; a NEW screen file must open at zero. When a
 * legacy screen is migrated to shared classes, lower its number here
 * in the same commit so the ratchet keeps tightening.
 */
const BASELINE: Record<string, number> = {
  'src/ui/screens/aiCard.ts': 3,
  'src/ui/screens/backupTools.ts': 1,
  'src/ui/screens/exercise.ts': 4,
  'src/ui/screens/statusBlock.ts': 4,
  'src/ui/screens/syncBar.ts': 11,
  'src/ui/screens/unitCard.ts': 2,
};
const PATTERN = /\.style\s*\.|cssText/;

describe('ELOS UI inline-style ratchet - WP-1 follow-up', () => {
  it('no screen file carries element.style beyond its frozen baseline (new screens open at zero)', () => {
    const root = process.cwd();
    const dir = path.join(root, 'src/ui/screens');
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.ts'));
    assert.ok(files.length > 0, 'No screen files found under src/ui/screens');

    const offenders: string[] = [];
    const remaining: string[] = [];
    for (const name of files) {
      const relative = `src/ui/screens/${name}`;
      const content = fs.readFileSync(path.join(dir, name), 'utf-8');
      // Count STATEMENTS (lines), not regex hits: a single line like
      // `row.style.cssText = ...` matches both alternatives at once.
      const count = content
        .split('\n')
        .filter((line) => PATTERN.test(line)).length;
      const limit = BASELINE[relative] ?? 0;
      if (count > limit) {
        offenders.push(
          `${relative}: ${count} inline-style occurrence(s), baseline is ${limit}`
        );
      }
      if (count > 0) {
        remaining.push(`${relative}: ${count}`);
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      'New element.style usage in screen files is blocked. Move the styles ' +
        'to shared classes in index.html (the WP-1 pattern), then lower the ' +
        'baseline entry in this test:\n' +
        offenders.join('\n')
    );

    // Visible ratchet status: what is left to migrate.
    console.log(
      remaining.length === 0
        ? 'inline-style ratchet: all screens are clean.'
        : `inline-style ratchet: legacy inline styles remain in ${remaining.length} file(s) -> ${remaining.join(', ')}. Lower the baseline when migrated.`
    );
  });
});
