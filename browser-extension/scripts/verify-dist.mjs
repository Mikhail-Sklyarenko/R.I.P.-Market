#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isolatedScripts = [
  'dist/content/steam-bridge.js',
  'dist/content/trade-verification-bridge.js',
  'dist/page-scripts/trade-offer-ui.js',
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
