import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCacheName, renderServiceWorker } from '../scripts/sw-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('Milestone E.1: PWA and Service Worker generator', () => {
  it('computeCacheName returns elos- prefix plus 12 hex characters', () => {
    const name = computeCacheName([
      { path: '/index.html', content: 'test content' },
    ]);
    assert.match(name, /^elos-[0-9a-f]{12}$/);
  });

  it('computeCacheName is deterministic and insensitive to input array order', () => {
    const fileA = { path: '/a.js', content: 'console.log("a");' };
    const encoder = new TextEncoder();
    const fileB = { path: '/b.js', content: encoder.encode('console.log("b");') };
    const fileC = { path: '/c.js', content: 'console.log("c");' };

    const name1 = computeCacheName([fileA, fileB, fileC]);
    const name2 = computeCacheName([fileC, fileA, fileB]);
    const name3 = computeCacheName([fileB, fileC, fileA]);

    assert.strictEqual(name1, name2);
    assert.strictEqual(name2, name3);
  });

  it('computeCacheName changes when content changes', () => {
    const fileA1 = { path: '/a.js', content: 'version 1' };
    const fileA2 = { path: '/a.js', content: 'version 2' };

    const name1 = computeCacheName([fileA1]);
    const name2 = computeCacheName([fileA2]);

    assert.notStrictEqual(name1, name2);
  });

  it('renderServiceWorker properly replaces tokens', () => {
    const template = 'const CACHE = "__CACHE_NAME__";\nconst PRECACHE = __PRECACHE_LIST__;\n';
    const rendered = renderServiceWorker(template, 'elos-abcdef123456', ['/a.js', '/b.js']);

    assert.ok(rendered.includes('const CACHE = "elos-abcdef123456";'));
    assert.ok(rendered.includes('"/a.js"'));
    assert.ok(rendered.includes('"/b.js"'));
    assert.ok(!rendered.includes('__CACHE_NAME__'));
    assert.ok(!rendered.includes('__PRECACHE_LIST__'));
  });

  it('renderServiceWorker throws if template is missing tokens', () => {
    assert.throws(() => {
      renderServiceWorker('const CACHE = "test";', 'elos-123456789012', ['/']);
    });
    assert.throws(() => {
      renderServiceWorker('const CACHE = "__CACHE_NAME__";', 'elos-123456789012', ['/']);
    });
  });

  it('sw.template.js contains skipWaiting and clients.claim and does not contain NETWORK_TIMEOUT_MS', () => {
    const templatePath = path.join(rootDir, 'sw.template.js');
    assert.ok(fs.existsSync(templatePath), 'sw.template.js must exist');
    const templateContent = fs.readFileSync(templatePath, 'utf8') as string;
    assert.ok(templateContent.includes('skipWaiting'), 'template must contain skipWaiting');
    assert.ok(templateContent.includes('clients.claim'), 'template must contain clients.claim');
    assert.ok(!templateContent.includes('NETWORK_TIMEOUT_MS'), 'template must not contain NETWORK_TIMEOUT_MS');
  });

  it('generated sw.js exists, has no placeholder tokens, lists every .js file under dist, and all precached files exist on disk', () => {
    const swPath = path.join(rootDir, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist on disk');

    const swContent = fs.readFileSync(swPath, 'utf8') as string;
    assert.ok(!swContent.includes('__CACHE_NAME__'), 'sw.js must not contain __CACHE_NAME__');
    assert.ok(!swContent.includes('__PRECACHE_LIST__'), 'sw.js must not contain __PRECACHE_LIST__');

    // Extract PRECACHE array
    const precacheMatch = swContent.match(/const\s+PRECACHE\s*=\s*(\[[^\]]+\]);/s);
    assert.ok(Boolean(precacheMatch), 'PRECACHE array must be defined in sw.js');

    if (!precacheMatch) return;

    const precacheList = JSON.parse(precacheMatch[1]) as string[];
    assert.ok(Array.isArray(precacheList));
    assert.ok(precacheList.length > 0, 'PRECACHE list must not be empty');
    assert.ok(precacheList.includes('./'), 'PRECACHE must include ./');
    assert.ok(precacheList.includes('./index.html'), 'PRECACHE must include ./index.html');
    assert.ok(precacheList.includes('./manifest.webmanifest'), 'PRECACHE must include ./manifest.webmanifest');

    // Check that every .js file under dist is listed in PRECACHE
    const distDir = path.join(rootDir, 'dist');
    if (fs.existsSync(distDir)) {
      function collectJsFiles(dir: string, base: string): string[] {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.join(base, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(collectJsFiles(full, rel));
          } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push('./dist/' + rel.replace(/\\/g, '/'));
          }
        }
        return results;
      }
      const allDistJs = collectJsFiles(distDir, '');
      assert.ok(allDistJs.length > 0, 'There should be dist .js files');
      for (const jsFile of allDistJs) {
        assert.ok(
          precacheList.includes(jsFile),
          `PRECACHE list must include dist js file: ${jsFile}`
        );
      }
    }

    for (const urlPath of precacheList) {
      const diskPath =
        urlPath === './' || urlPath === './index.html'
          ? path.join(rootDir, 'index.html')
          : path.join(rootDir, urlPath.startsWith('./') ? urlPath.slice(2) : urlPath);

      assert.ok(
        fs.existsSync(diskPath),
        `Precache asset must exist on disk: ${urlPath} -> ${diskPath}`
      );
    }
  });
});
