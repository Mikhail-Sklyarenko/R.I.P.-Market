// Local Playwright fixture only. This file is not an HTTP route or a build input.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertTestContext(env, orderId) {
  if (env.ENABLE_TEST_ROUTES !== 'true' || env.NODE_ENV !== 'test') {
    throw new Error('UI settlement fixture requires explicit test mode');
  }
  if (env.AUTH_PROVIDER !== 'mock' || env.INVENTORY_PROVIDER !== 'mock' ||
      env.TRADE_PROVIDER !== 'mock' || !['mock', 'e2e_crypto'].includes(env.PAYMENT_PROVIDER)) {
    throw new Error('UI settlement fixture requires mock providers');
  }
  const database = new URL(env.DATABASE_URL ?? 'http://invalid');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/p2pcs_e2e') {
    throw new Error('UI settlement fixture requires local p2pcs_e2e');
  }
  if (!UUID.test(orderId ?? '')) throw new Error('Invalid fixture order ID');
}

async function main() {
  const orderId = process.argv[2];
  // Validate before loading Nest/Prisma, opening a connection or enabling any policy.
  assertTestContext(process.env, orderId);
  process.env.JEST_WORKER_ID = 'ui-fixture';
  process.env.STEAM_MARKET_PRICE_ENABLED = 'false';
  process.env.STEAM_ITEM_ICON_ENABLED = 'false';
  require('ts-node/register');
  const { createE2eApp } = require('./bootstrap-e2e-app');
  const { prepareProofBackedHold, withProofSettlementPolicy } = require('./proof-backed-settlement');
  const { PrismaService } = require('../../src/prisma/prisma.service');
  const { SettlementService } = require('../../src/settlement/settlement.service');
  const app = await createE2eApp();
  const db = app.get(PrismaService);
  try {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.amountMinor <= 0n || order.amountMinor > 100000n) throw new Error('Fixture amount exceeds UI test limit');
    await withProofSettlementPolicy(Number(order.amountMinor), async () => {
      await prepareProofBackedHold(app, orderId);
      const result = await app.get(SettlementService).releaseDueSettlementHold(orderId);
      if (!result.settled) throw new Error('Proof-backed UI settlement was blocked');
    });
    console.log('UI_PROOF_SETTLEMENT_COMPLETED');
  } finally {
    await app.close();
    await db.$disconnect();
  }
}

module.exports = { assertTestContext };
if (require.main === module) {
  main().catch(() => {
    // Do not emit database connection strings or upstream exception contents.
    console.error('UI_PROOF_SETTLEMENT_FAILED');
    process.exitCode = 1;
  });
}
