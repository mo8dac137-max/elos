#!/usr/bin/env node
/**
 * Collaboration pack generator (owner directive 2026-11-08, item 2):
 * the fixed, reproducible way to hand the design partner the CURRENT
 * state of the project before every task.
 *
 * Usage:
 *   node scripts/collab-pack.mjs <file...> [--out <dir>] [--no-tests]
 *
 * Always includes (automatically):
 *   - docs/design-partner-brief.md  (the mandate + decision log)
 *   - docs/roadmap.md               (shared staged roadmap)
 *   - PACK.md: date, latest commit, branch, test results, sw cache name,
 *     and the list of bundled files.
 *
 * The pack is sanitized BY CONSTRUCTION: only repo files passed as
 * arguments are read, and a secret-pattern scan runs over every included
 * file before zipping. Any hit aborts the pack. No tokens, no credentials,
 * no environment values are ever written into the pack.
 *
 * Output: elos-collab-<shortsha>-<yyyymmdd>.zip in --out (default:
 * /home/z/my-project/download/).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const DEFAULT_OUT = '/home/z/my-project/download';

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,          // GitHub tokens
  /github_pat_[A-Za-z0-9_]{30,}/,        // GitHub fine-grained
  /AIza[0-9A-Za-z\-_]{30,}/,             // Google API keys
  /sb_publishable_[A-Za-z0-9]{20,}/,     // Supabase publishable (client-safe but loud)
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ/, // JWT header prefix
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,        // Slack
  /sk-[A-Za-z0-9]{20,}/,                 // generic API secret
];

function fail(msg) {
  console.error('collab-pack: ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const files = [];
  let out = DEFAULT_OUT;
  let runTests = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      out = argv[++i];
      if (!out) fail('--out requires a directory');
    } else if (a === '--no-tests') {
      runTests = false;
    } else {
      files.push(a);
    }
  }
  return { files, out, runTests };
}

const { files, out, runTests } = parseArgs(process.argv.slice(2));
if (files.length === 0) {
  fail('no task files given. Usage: node scripts/collab-pack.mjs <file...>');
}

function git(...args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8' }).trim();
}

// --- resolve every requested file to a repo-relative path ---
const include = [];
for (const f of files) {
  const rel = path.posix.normalize(f.replace(/\\/g, '/')).replace(/^\.\//, '');
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) fail('file not found in repo: ' + rel);
  include.push({ rel, abs });
}

// --- auto-included context documents ---
for (const doc of ['docs/design-partner-brief.md', 'docs/roadmap.md']) {
  const abs = path.join(rootDir, doc);
  if (fs.existsSync(abs) && !include.some((i) => i.rel === doc)) {
    include.push({ rel: doc, abs });
  }
}

// --- repo facts (all derived live, nothing hand-maintained) ---
const commit = git('rev-parse', 'HEAD');
const short = commit.slice(0, 7);
const subject = git('log', '-1', '--pretty=%s');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;

let swCache = 'unknown';
const sw = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf-8');
const m = sw.match(/elos-[a-f0-9]+/);
if (m) swCache = m[0];

let testsLine = 'not run in this pack (--no-tests)';
if (runTests) {
  try {
    const outBuf = execFileSync('npm', ['test'], {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    const t = outBuf.match(/[#ℹ] tests (\d+)/);
    const p = outBuf.match(/[#ℹ] pass (\d+)/);
    const f = outBuf.match(/[#ℹ] fail (\d+)/);
    testsLine = `${p ? p[1] : '?'}/${t ? t[1] : '?'} pass${
      f && f[1] !== '0' ? ', FAIL ' + f[1] : ''
    }`;
  } catch (err) {
    const buf = String(err.stdout || '') + String(err.stderr || '');
    const f = buf.match(/# fail (\d+)/);
    fail('test suite failed (' + (f ? f[1] + ' failing' : 'unknown') + ') — pack not built');
  }
}

// --- secret scan over everything that will enter the zip ---
for (const { rel, abs } of include) {
  const content = fs.readFileSync(abs, 'utf-8');
  for (const re of SECRET_PATTERNS) {
    const hit = content.match(re);
    if (hit) fail(`secret pattern in ${rel} (${hit[0].slice(0, 12)}...) — pack aborted`);
  }
}

// --- build the zip deterministically (store-only, no external deps) ---
const date = new Date();
const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
const zipName = `elos-collab-${short}-${stamp}.zip`;
const zipPath = path.join(out, zipName);
fs.mkdirSync(out, { recursive: true });

// Minimal ZIP writer (stored, no compression) — keeps the repo free of
// archiving dependencies, consistent with the no-external-libs rule.
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PACK_MD = `# ELOS collaboration pack

- Generated: ${date.toISOString()}
- Commit: ${short} — ${subject}
- Branch: ${branch}${dirty ? ' (WORKING TREE NOT CLEAN — this pack is a snapshot of uncommitted state)' : ' (clean)'}
- Tests: ${testsLine}
- Live SW cache: ${swCache}
- Live site: https://mo8dac137-max.github.io/elos/

## Bundled files
${include.map((i) => '- ' + i.rel).join('\n')}

This pack is a READ-ONLY snapshot for the design partner. The repository
remains the single source of truth; nothing here grants push or deploy
rights. The pack contains no secrets by construction (pattern-scanned).

Status key for task work: proposed -> reviewed -> merged -> published is
tracked by the supervisor in the project state log; a proposed file is
NOT published until it passes the supervisor gate.
`;

const entries = [{ name: 'PACK.md', data: Buffer.from(PACK_MD, 'utf-8') }];
for (const { rel, abs } of include) {
  entries.push({ name: rel, data: fs.readFileSync(abs) });
}

const chunks = [];
const central = [];
let offset = 0;
for (const e of entries) {
  const nameBuf = Buffer.from(e.name, 'utf-8');
  const crc = crc32(e.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0, 12); // date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(e.data.length, 18);
  local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, e.data);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(e.data.length, 20);
  cd.writeUInt32LE(e.data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);

  offset += 30 + nameBuf.length + e.data.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuf, end]));
console.log(`collab-pack: ${zipPath}`);
console.log(`  commit ${short} (${branch}), tests ${testsLine}, sw ${swCache}`);
console.log(`  files: ${include.length + 1} (PACK.md + task files + context docs)`);
