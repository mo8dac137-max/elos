import crypto from 'node:crypto';

export interface PrecacheFile {
  path: string;
  content: string | Uint8Array;
}

export function computeCacheName(files: PrecacheFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = crypto.createHash('sha256');

  for (const file of sorted) {
    hash.update(file.path, 'utf8');
    if (typeof file.content === 'string') {
      hash.update(file.content, 'utf8');
    } else {
      hash.update(file.content);
    }
  }

  const hex = hash.digest('hex');
  return `elos-${hex.slice(0, 12)}`;
}

export function renderServiceWorker(
  template: string,
  cacheName: string,
  precache: string[],
): string {
  if (!template.includes('__CACHE_NAME__') || !template.includes('__PRECACHE_LIST__')) {
    throw new Error('Template is missing required placeholder tokens.');
  }

  const precacheLiteral = JSON.stringify(precache, null, 2);
  const rendered = template
    .replaceAll('__CACHE_NAME__', cacheName)
    .replaceAll('__PRECACHE_LIST__', precacheLiteral);

  if (rendered.includes('__CACHE_NAME__') || rendered.includes('__PRECACHE_LIST__')) {
    throw new Error('Unresolved placeholders remain in rendered service worker.');
  }

  return rendered;
}
