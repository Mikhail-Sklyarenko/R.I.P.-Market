import express from 'express';
import { loadApiConfig } from '../shared/config.js';
import { bearerAuth } from './auth-middleware.js';
import { prisma } from '../db/client.js';
import { isValidTronAddress } from '../shared/bip44.js';
import { parseSun } from '../shared/sun.js';
import {
  createWithdrawal,
  ensureGatewayUser,
  getGatewayUser,
  getUserBalance,
  getWithdrawal,
  listUserPayments,
} from '../services/user.service.js';

export function createApiApp() {
  const config = loadApiConfig();
  const app = express();
  app.use(express.json());

  app.get('/v1/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, service: 'crypto-gateway-api' });
    } catch {
      res.status(503).json({ ok: false, service: 'crypto-gateway-api' });
    }
  });

  app.use(bearerAuth(config.apiKey));

  app.post('/v1/users', async (req, res) => {
    const externalUserId = String(req.body?.externalUserId ?? '').trim();
    if (!externalUserId) {
      res.status(400).json({ error: 'externalUserId is required' });
      return;
    }

    try {
      const user = await ensureGatewayUser(externalUserId, {
        mnemonic: process.env.MNEMONIC ?? '',
        xpub: config.xpub,
      });
      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create user',
      });
    }
  });

  app.get('/v1/users/:externalUserId', async (req, res) => {
    const user = await getGatewayUser(req.params.externalUserId);
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    res.json(user);
  });

  app.get('/v1/users/:externalUserId/balance', async (req, res) => {
    const balance = await getUserBalance(req.params.externalUserId);
    if (!balance) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    res.json(balance);
  });

  app.get('/v1/users/:externalUserId/payments', async (req, res) => {
    const payments = await listUserPayments(req.params.externalUserId);
    res.json({ items: payments });
  });

  app.post('/v1/withdrawals', async (req, res) => {
    const externalUserId = String(req.body?.externalUserId ?? '').trim();
    const toAddress = String(req.body?.toAddress ?? '').trim();
    const amountSunRaw = req.body?.amountSun;

    if (!externalUserId || !toAddress || amountSunRaw === undefined) {
      res.status(400).json({ error: 'externalUserId, toAddress, amountSun required' });
      return;
    }

    if (!isValidTronAddress(toAddress)) {
      res.status(400).json({ error: 'INVALID_TRON_ADDRESS' });
      return;
    }

    let amountSun: bigint;
    try {
      amountSun = parseSun(amountSunRaw);
    } catch {
      res.status(400).json({ error: 'INVALID_AMOUNT' });
      return;
    }

    if (amountSun <= 0n) {
      res.status(400).json({ error: 'AMOUNT_MUST_BE_POSITIVE' });
      return;
    }

    const feeSun = BigInt(process.env.WITHDRAWAL_FEE_SUN ?? '0');

    try {
      const withdrawal = await createWithdrawal({
        externalUserId,
        toAddress,
        amountSun,
        feeSun,
      });
      res.status(201).json(withdrawal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WITHDRAWAL_FAILED';
      if (message === 'USER_NOT_FOUND') {
        res.status(404).json({ error: message });
        return;
      }
      if (message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  app.get('/v1/withdrawals/:id', async (req, res) => {
    const withdrawal = await getWithdrawal(req.params.id);
    if (!withdrawal) {
      res.status(404).json({ error: 'WITHDRAWAL_NOT_FOUND' });
      return;
    }
    res.json(withdrawal);
  });

  return app;
}
