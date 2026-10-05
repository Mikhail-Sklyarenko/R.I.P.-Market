import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

/** Runs only against the disposable local test DB; no production HTTP endpoint. */
export async function completeProofBackedOrder(orderId: string): Promise<void> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['test/helpers/complete-ui-order.cjs', orderId],
    {
      cwd: resolve(process.cwd(), '../backend'),
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ENABLE_TEST_ROUTES: 'true',
        AUTH_PROVIDER: 'mock',
        INVENTORY_PROVIDER: 'mock',
        TRADE_PROVIDER: 'mock',
        PAYMENT_PROVIDER: 'mock',
        JWT_SECRET: process.env.JWT_SECRET ?? 'playwright-jwt-secret',
      },
    },
  );
  if (!stdout.includes('UI_PROOF_SETTLEMENT_COMPLETED')) {
    throw new Error('UI proof-backed settlement did not complete');
  }
}
