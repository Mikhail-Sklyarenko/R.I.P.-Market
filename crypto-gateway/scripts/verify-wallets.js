#!/usr/bin/env node
/**
 * Pre-deploy gate: verify wallet registry addresses match BIP44 derivation.
 * Requires DATABASE_URL, and MNEMONIC or XPUB.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  deriveTronAddressFromMnemonic,
  deriveTronAddressFromXpub,
} from '../dist/shared/bip44.js';

const prisma = new PrismaClient();

function derive(walletIndex, mnemonic, xpub) {
  if (mnemonic) {
    return deriveTronAddressFromMnemonic(mnemonic, walletIndex);
  }
  if (xpub) {
    return deriveTronAddressFromXpub(xpub, walletIndex);
  }
  throw new Error('MNEMONIC or XPUB required');
}

async function main() {
  const mnemonic = process.env.MNEMONIC ?? '';
  const xpub = process.env.XPUB ?? '';
  const wallets = await prisma.walletRegistry.findMany({
    orderBy: { walletIndex: 'asc' },
  });

  let mismatches = 0;
  for (const wallet of wallets) {
    const expected = derive(wallet.walletIndex, mnemonic, xpub);
    if (expected !== wallet.address) {
      mismatches += 1;
      console.error(
        `MISMATCH index=${wallet.walletIndex} expected=${expected} actual=${wallet.address}`,
      );
    }
  }

  if (mismatches > 0) {
    console.error(`verify-wallets failed: ${mismatches} mismatch(es)`);
    process.exit(1);
  }

  console.log(`verify-wallets ok: ${wallets.length} wallet(s) checked`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
