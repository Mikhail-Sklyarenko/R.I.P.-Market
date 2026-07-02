import { loadApiConfig } from '../shared/config.js';
import { createTronGridClient } from './trongrid.js';
import { runScannerTick } from './scanner-logic.js';

const config = loadApiConfig();
const tronGrid = createTronGridClient({
  baseUrl: config.tronGridBaseUrl,
  apiKey: config.tronGridApiKey,
});

const INTERVAL_MS = Number(process.env.SCANNER_INTERVAL_MS ?? 15_000);

async function tick(): Promise<void> {
  const result = await runScannerTick({ config, tronGrid });
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'scanner tick',
      ...result,
      scannedBlocks: result.scannedBlocks.toString(),
    }),
  );
}

void tick();
setInterval(() => {
  void tick().catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'scanner tick failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}, INTERVAL_MS);
