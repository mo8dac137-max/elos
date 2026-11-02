import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

const MAX_LINES = 400;
const EXEMPT = new Set(['src/kernel/index.ts']);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe('ELOS source-size rule - Milestone F3', () => {
  it(`no .ts file under src/ or scripts/ exceeds ${MAX_LINES} lines (src/kernel/index.ts is exempt)`, () => {
    const projectRoot = process.cwd();
    const files = [
      ...collectSourceFiles(path.join(projectRoot, 'src')),
      ...collectSourceFiles(path.join(projectRoot, 'scripts')),
    ];

    assert.ok(files.length > 0, 'No source files found');

    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(projectRoot, file).split(path.sep).join('/');
      if (EXEMPT.has(relative)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lineCount = content.split('\n').length;
      if (lineCount > MAX_LINES) {
        offenders.push(`${relative}: ${lineCount} lines`);
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Files over the ${MAX_LINES}-line limit:\n${offenders.join('\n')}`
    );
  });

  it('the limit covers src/app, src/ui, src/content, scripts and every kernel file except src/kernel/index.ts', () => {
    const projectRoot = process.cwd();
    const files = [
      ...collectSourceFiles(path.join(projectRoot, 'src')),
      ...collectSourceFiles(path.join(projectRoot, 'scripts')),
    ].map((f) => path.relative(projectRoot, f).split(path.sep).join('/'));

    for (const requiredDir of ['src/app', 'src/ui', 'src/content', 'src/kernel', 'scripts']) {
      assert.ok(
        files.some((f) => f.startsWith(requiredDir + '/')),
        `No source files found under ${requiredDir}`
      );
    }

    assert.ok(files.includes('src/kernel/index.ts'), 'the exempt file must still exist');
    assert.ok(!EXEMPT.has('src/kernel/schedule.ts'));
    assert.ok(!EXEMPT.has('src/kernel/planner.ts'));
  });
});
