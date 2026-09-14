import { TronWeb } from 'tronweb';
import { prisma } from '../db/client.js';
import { deriveTronPrivateKeyFromMnemonic } from '../shared/bip44.js';
import { loadConfig } from '../shared/config.js';
import { flushWebhookQueue } from '../webhook/emitter.js';
import { processPayout } from './payout-engine.js';

let running = false;
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const config = loadConfig();
    if (!config.mnemonic || !config.hotWalletAddress)
      throw new Error('Signer wallet configuration required');
    const privateKey = deriveTronPrivateKeyFromMnemonic(config.mnemonic, 0);
    if (TronWeb.address.fromPrivateKey(privateKey) !== config.hotWalletAddress)
      throw new Error('Signer address does not match configured hot wallet');
    const tron = new TronWeb({
      fullHost: config.tronGridBaseUrl,
      privateKey,
      headers: config.tronGridApiKey
        ? { 'TRON-PRO-API-KEY': config.tronGridApiKey }
        : undefined,
    });
    await flushWebhookQueue(config.webhookUrl, config.webhookSecret);
    const rows = await prisma.withdrawal.findMany({
      where: { status: { in: ['pending', 'processing'] } },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const row of rows) await processPayout(row.id, tron, config);
  } finally {
    running = false;
  }
}
const run = () =>
  void tick().catch((error) =>
    console.error(
      'Signer tick failed',
      error instanceof Error ? error.message : 'unknown',
    ),
  );
run();
setInterval(run, Number(process.env.SIGNER_INTERVAL_MS ?? 10_000));
