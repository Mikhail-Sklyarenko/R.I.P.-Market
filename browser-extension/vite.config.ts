import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const root = __dirname;

const isolatedScriptEntries = [
  'content/steam-bridge',
  'content/trade-verification-bridge',
  'content/trade-offers-list-bridge',
  'content/inventory-bridge',
  'page-scripts/trade-offer-ui',
  'page-scripts/inventory-enrichment',
] as const;

async function bundleIsolatedScripts(): Promise<void> {
  await Promise.all(
    isolatedScriptEntries.map((entry) =>
      esbuild.build({
        entryPoints: [resolve(root, `src/${entry}.ts`)],
        bundle: true,
        outfile: resolve(root, `dist/${entry}.js`),
        format: 'iife',
        platform: 'browser',
        target: 'chrome109',
        sourcemap: true,
        logLevel: 'silent',
      }),
    ),
  );
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // MV3 service workers have no `window`/`document`. Vite's modulepreload
    // helper uses both and surfaces as "window is not defined" on pair.
    modulePreload: false,
    target: 'chrome109',
    rollupOptions: {
      input: {
        'background/service-worker': resolve(
          root,
          'src/background/service-worker.ts',
        ),
        'popup/popup': resolve(root, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'bundle-isolated-extension-scripts',
      async closeBundle() {
        await bundleIsolatedScripts();
      },
    },
  ],
});
