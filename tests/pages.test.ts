import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

describe('ELOS Milestone H1.5 - GitHub Pages Readiness', () => {
  const rootDir = process.cwd();

  it('1. index.html contains no absolute src="/ or href="/ (all references are relative)', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(!content.includes('src="/'), 'index.html must not contain src="/');
    assert.ok(!content.includes('href="/'), 'index.html must not contain href="/');
  });

  it('2. manifest.webmanifest parses and uses ./ relative paths for id, start_url, scope, and icons', () => {
    const manifestPath = path.join(rootDir, 'manifest.webmanifest');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    assert.strictEqual(manifest.id, './');
    assert.strictEqual(manifest.start_url, './');
    assert.strictEqual(manifest.scope, './');

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      assert.ok(
        typeof icon.src === 'string' && icon.src.startsWith('./'),
        `icon.src must start with ./: ${icon.src}`
      );
      assert.ok(
        !icon.src.startsWith('/'),
        `icon.src must not start with /: ${icon.src}`
      );
    }
  });

  it('3. src/ui/pwa.ts registers ./sw.js and does not register /sw.js', () => {
    const pwaPath = path.join(rootDir, 'src', 'ui', 'pwa.ts');
    const content = fs.readFileSync(pwaPath, 'utf8');
    assert.ok(content.includes("register('./sw.js')"));
    assert.ok(!content.includes("register('/sw.js')"));
  });

  it('4. sw.template.js resolves index against self.registration.scope and does not match literal /index.html', () => {
    const swTemplatePath = path.join(rootDir, 'sw.template.js');
    const content = fs.readFileSync(swTemplatePath, 'utf8');
    assert.ok(!content.includes("cache.match('/index.html')"));
    assert.ok(content.includes('self.registration.scope'));
  });

  it('5. scripts/build-sw.ts does not contain /${relPath} template and contains ./index.html', () => {
    const buildSwPath = path.join(rootDir, 'scripts', 'build-sw.ts');
    const content = fs.readFileSync(buildSwPath, 'utf8');
    assert.ok(!content.includes('/${relPath}'));
    assert.ok(content.includes("'./index.html'"));
  });

  it('6. The generated sw.js PRECACHE array is non-empty and every entry starts with ./ (no absolute paths)', () => {
    const swPath = path.join(rootDir, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist on disk');
    const content = fs.readFileSync(swPath, 'utf8');
    const precacheMatch = content.match(/const\s+PRECACHE\s*=\s*(\[[^\]]+\]);/s);
    assert.ok(Boolean(precacheMatch), 'PRECACHE array must be present in sw.js');

    const precacheList = JSON.parse(precacheMatch![1]) as string[];
    assert.ok(Array.isArray(precacheList));
    assert.ok(precacheList.length > 0, 'PRECACHE array must be non-empty');
    for (const item of precacheList) {
      assert.ok(
        item.startsWith('./'),
        `Every precache item must start with ./: found ${item}`
      );
      assert.ok(
        !item.startsWith('/'),
        `Precache item must not start with /: found ${item}`
      );
    }
  });

  it('7. .github/workflows/deploy-pages.yml exists, runs test/build, uses official actions, and has no custom secrets', () => {
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'deploy-pages.yml');
    assert.ok(fs.existsSync(workflowPath), 'Workflow file must exist');
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('npm test'));
    assert.ok(content.includes('npm run build'));
    assert.ok(content.includes('actions/upload-pages-artifact@v3'));
    assert.ok(content.includes('actions/deploy-pages@v4'));
    assert.ok(!content.includes('${{ secrets.'));
  });

  it('8. .gitignore contains a line site/', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n').map((l) => l.trim());
    assert.ok(lines.includes('site/'));
  });
});
