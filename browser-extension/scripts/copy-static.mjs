#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

mkdirSync(resolve(dist, 'popup'), { recursive: true });
mkdirSync(resolve(dist, 'icons'), { recursive: true });

copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));
copyFileSync(
  resolve(root, 'src/popup/popup.html'),
  resolve(dist, 'popup/popup.html'),
);
cpSync(resolve(root, 'icons'), resolve(dist, 'icons'), { recursive: true });

console.log('Copied manifest, popup, and icons to dist/');
