#!/usr/bin/env node
/**
 * WP-3 phase 1 evidence base: extract every user-facing string literal
 * from the CURRENT source tree. Output is a TSV on stdout:
 *   file <TAB> line <TAB> kind <TAB> string
 *
 * "User-facing" = assigned to textContent, passed to a screen factory
 * helper (createButton/createSectionLabel/createHeader/createRtlBlock),
 * shown as a notice, or returned by a display formatter. Learning
 * CONTENT (word glosses, English definitions/examples, reader texts,
 * grammar unit titles) is tagged 'content' so the curator can keep it
 * English by rule; everything else is chrome candidates for the
 * translation table.
 *
 * This is the extraction tool only; the curated translation table is a
 * separate reviewed deliverable. Run: node scripts/extract_ui_strings.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const SRC = path.join(rootDir, 'src');

const FILES = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) FILES.push(p);
  }
})(SRC);

function classify(file, lineText, raw) {
  const f = path.relative(rootDir, file).split(path.sep).join('/');
  // content sources: stay English by rule
  if (f.startsWith('src/content/')) return 'content';
  if (/unitTitle|title\s*=/.test(lineText) && /(Word:|grammar)/.test(raw)) return 'content';
  if (/createRtlBlock/.test(lineText)) return 'content-ar';
  if (/createButton\s*\(\s*['"`]/.test(lineText)) return 'button';
  if (/createSectionLabel\s*\(\s*['"`]/.test(lineText)) return 'label';
  if (/createHeader\s*\(\s*['"`]/.test(lineText)) return 'header';
  if (/textContent\s*=/.test(lineText)) return 'textContent';
  if (/showNotice|notice/.test(lineText)) return 'notice';
  if (/return\s+['"`]|=>\s*['"`]/.test(lineText)) return 'return';
  if (/(placeholder|aria-label|title)\s*=/.test(lineText)) return 'attr';
  return 'other';
}

const out = [];
for (const file of FILES) {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    // string literals: '...', "...", `...` (single line only)
    const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const raw = m[2];
      if (raw.length === 0) continue;
      // skip obvious non-UI tokens
      if (/^(src\/|\.\/|\.\.\/|node:)/.test(raw)) continue; // imports
      if (/^[a-z0-9-]+(\.[a-z0-9]+)?$/.test(raw) && !/ /.test(raw)) continue; // css/ids/files
      if (/^(word|grammar):/.test(raw)) continue; // unit ids
      if (/^[a-z]+(-[a-z]+)*$/.test(raw)) continue; // kebab class names
      if (raw.startsWith('http')) continue;
      if (!/[a-zA-Z\u0600-\u06FF]/.test(raw)) continue; // pure symbols
      const kind = classify(file, line, raw);
      out.push([path.relative(rootDir, file).split(path.sep).join('/'), i + 1, kind, raw]);
    }
  }
}

// emit grouped by file
out.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1));
for (const [f, ln, kind, raw] of out) {
  process.stdout.write(`${f}\t${ln}\t${kind}\t${raw.replace(/\t/g, ' ')}\n`);
}
const chrome = out.filter((o) => !['content', 'content-ar'].includes(o[2])).length;
const content = out.length - chrome;
process.stderr.write(`total literals: ${out.length} (chrome candidates: ${chrome}, content-tagged: ${content})\n`);
