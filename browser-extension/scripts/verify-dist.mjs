#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isolatedScripts = [
  'dist/content/steam-bridge.js',
  'dist/content/trade-verification-bridge.js',
  'dist/content/trade-offers-list-bridge.js',
  'dist/content/inventory-bridge.js',
  'dist/page-scripts/trade-offer-ui.js',
  'dist/page-scripts/inventory-enrichment.js',
];

for (const relativePath of isolatedScripts) {
  const filePath = resolve(root, relativePath);
  const source = readFileSync(filePath, 'utf8').trimStart();
  if (source.startsWith('import ') || source.startsWith('import{')) {
    throw new Error(
      `${relativePath} must be a self-contained IIFE without top-level import`,
    );
  }
}

console.log('Verified isolated extension scripts (no top-level imports)');

/** MV3 SW has no window/document — keep browser DOM APIs out of the worker bundle. */
const serviceWorkerPath = resolve(root, 'dist/background/service-worker.js');
const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8');
const forbiddenSwMarkers = [
  'vite:preloadError',
  'modulepreload',
  'document.getElementsByTagName("link")',
];
for (const marker of forbiddenSwMarkers) {
  if (serviceWorkerSource.includes(marker)) {
    throw new Error(
      `dist/background/service-worker.js contains forbidden Vite browser helper (${marker}). ` +
        'Set build.modulePreload: false and avoid dynamic import() in the service worker.',
    );
  }
}
if (/window\.dispatchEvent/.test(serviceWorkerSource)) {
  throw new Error(
    'dist/background/service-worker.js must not call window.dispatchEvent (Vite preload helper).',
  );
}
if (/await import\(|(?<![.\w])import\(/.test(serviceWorkerSource)) {
  throw new Error(
    'dist/background/service-worker.js must not use dynamic import() — it pulls Vite preload helpers that crash in MV3.',
  );
}
// Live DOM globals (string literals like "window is not defined" are OK).
if (/\bwindow\./.test(serviceWorkerSource) || /(?<![.\w])window\s*[,;=)]/.test(serviceWorkerSource)) {
  throw new Error(
    'dist/background/service-worker.js must not reference window (use page-scripts + globalThis bridges).',
  );
}
if (/\bdocument\./.test(serviceWorkerSource)) {
  throw new Error(
    'dist/background/service-worker.js must not reference document (MAIN-world only via page-scripts).',
  );
}
if (!serviceWorkerSource.includes('page-scripts/inventory-enrichment.js')) {
  throw new Error(
    'dist/background/service-worker.js must inject page-scripts/inventory-enrichment.js for MAIN-world enrichment.',
  );
}
console.log('Verified service worker (no Vite preload / dynamic import / window / document)');
