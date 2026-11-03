import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { computeCacheName, renderServiceWorker, PrecacheFile } from './sw-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const templatePath = path.join(rootDir, 'sw.template.js');
const swOutputPath = path.join(rootDir, 'sw.js');
const manifestPath = path.join(rootDir, 'manifest.webmanifest');
const indexPath = path.join(rootDir, 'index.html');

function collectFilesRecursively(dir: string, baseDir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push('./' + relPath);
    }
  }

  return results;
}

function findPngIcons(): string[] {
  const icons = new Set<string>();

  // Check manifest.webmanifest
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8') as string;
      const manifest = JSON.parse(raw);
      if (Array.isArray(manifest.icons)) {
        for (const icon of manifest.icons) {
          if (icon && typeof icon.src === 'string' && icon.src.endsWith('.png')) {
            const normalized = icon.src.startsWith('./')
              ? icon.src
              : icon.src.startsWith('/')
                ? `./${icon.src.slice(1)}`
                : `./${icon.src}`;
            icons.add(normalized);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse manifest.webmanifest:', e);
      process.exit(1);
    }
  } else {
    console.error('manifest.webmanifest does not exist');
    process.exit(1);
  }

  // Check index.html for link rel with png
  if (fs.existsSync(indexPath)) {
    const indexHtml = fs.readFileSync(indexPath, 'utf8') as string;
    const linkMatches = indexHtml.matchAll(/<link[^>]+href=["']([^"']+\.png)["'][^>]*>/gi);
    for (const match of linkMatches) {
      const href = match[1];
      const normalized = href.startsWith('./')
        ? href
        : href.startsWith('/')
          ? `./${href.slice(1)}`
          : `./${href}`;
      icons.add(normalized);
    }
  } else {
    console.error('index.html does not exist');
    process.exit(1);
  }

  return Array.from(icons);
}

function main() {
  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    process.exit(1);
  }

  const icons = findPngIcons();
  const distJsFiles = collectFilesRecursively(distDir, rootDir);

  const precacheUrls = new Set<string>([
    './',
    './index.html',
    './manifest.webmanifest',
    ...icons,
    ...distJsFiles,
  ]);

  const sortedPrecache = Array.from(precacheUrls).sort();

  // Verify each file exists and load its content for hashing
  const filesForHashing: PrecacheFile[] = [];

  for (const urlPath of sortedPrecache) {
    let diskPath: string;
    if (urlPath === './' || urlPath === './index.html') {
      diskPath = indexPath;
    } else {
      const relPath = urlPath.startsWith('./') ? urlPath.slice(2) : urlPath;
      diskPath = path.join(rootDir, relPath);
    }

    if (!fs.existsSync(diskPath)) {
      console.error(`Precache asset does not exist on disk: ${urlPath} -> ${diskPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(diskPath) as Uint8Array | string;
    filesForHashing.push({
      path: urlPath,
      content,
    });
  }

  const cacheName = computeCacheName(filesForHashing);
  const template = fs.readFileSync(templatePath, 'utf8') as string;
  const rendered = renderServiceWorker(template, cacheName, sortedPrecache);

  fs.writeFileSync(swOutputPath, rendered, 'utf8');
  console.log(`Successfully generated sw.js with cache name: ${cacheName} and ${sortedPrecache.length} precached files.`);
}

main();
