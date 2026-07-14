import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '@prisma/client';
import * as steamOpenId from '../src/providers/auth/steam-openid.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

const OPENID_PARAMS = {
  'openid.ns': 'http://specs.openid.net/auth/2.0',
  'openid.mode': 'id_res',
  'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
  'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198999999999',
  'openid.identity': 'https://steamcommunity.com/openid/id/76561198999999999',
  'openid.return_to': 'http://localhost:3000/api/v1/auth/steam/callback',
  'openid.response_nonce': '2026-06-26T12:00:00Zabc',
  'openid.assoc_handle': '1234567890',
  'openid.signed':
    'mode,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  'openid.sig': 'abc123',
};

describe('Steam auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const previousAuthProvider = process.env.AUTH_PROVIDER;
  const previousAllowMockInSteamMode =
    process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;

  beforeAll(async () => {
    process.env.AUTH_PROVIDER = 'steam';
    delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    jest.spyOn(steamOpenId, 'verifySteamOpenId').mockResolvedValue({ ok: true });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    process.env.AUTH_PROVIDER = previousAuthProvider;
    if (previousAllowMockInSteamMode === undefined) {
      delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
    } else {
      process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE = previousAllowMockInSteamMode;
    }
    await app.close();
  });

  it('callback redirects to frontend with JWT for new steam user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/steam/callback')
      .query(OPENID_PARAMS)
      .expect(302);

    expect(response.headers.location).toMatch(
      /\/login\/steam\/callback\?accessToken=/,
    );
    expect(response.headers.location).toContain('steamId=76561198999999999');

    const user = await prisma.user.findUnique({
      where: { steamId: '76561198999999999' },
    });
    expect(user).not.toBeNull();
    expect(user?.role).toBe(UserRole.BUYER);
  });

  it('link-url flow links steamId to an existing user', async () => {
    const existing = await prisma.user.create({
      data: {
        username: 'mock_link_user',
        role: UserRole.SELLER,
        status: 'ACTIVE',
      },
    });
    const token = await jwt.signAsync({
      sub: existing.id,
      role: UserRole.SELLER,
    });

    const linkUrlResponse = await request(app.getHttpServer())
      .get('/api/v1/auth/steam/link-url')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const steamUrl = new URL((linkUrlResponse.body as { url: string }).url);
    const returnTo = steamUrl.searchParams.get('openid.return_to');
    expect(returnTo).toContain('link_state=');

    const returnToUrl = new URL(returnTo!);
    const linkState = returnToUrl.searchParams.get('link_state');

    const callbackResponse = await request(app.getHttpServer())
      .get('/api/v1/auth/steam/callback')
      .query({ ...OPENID_PARAMS, link_state: linkState })
      .expect(302);

    expect(callbackResponse.headers.location).toContain('linked=1');
    expect(callbackResponse.headers.location).toContain(
      'steamId=76561198999999999',
    );

    const updated = await prisma.user.findUnique({
      where: { id: existing.id },
    });
    expect(updated?.steamId).toBe('76561198999999999');
  });

  it('POST /auth/steam/link returns 409 when steamId is already linked', async () => {
    await prisma.user.create({
      data: {
        username: 'owner',
        steamId: '76561198999999999',
        role: UserRole.BUYER,
        status: 'ACTIVE',
      },
    });
    const linker = await prisma.user.create({
      data: {
        username: 'linker',
        role: UserRole.BUYER,
        status: 'ACTIVE',
      },
    });
    const token = await jwt.signAsync({ sub: linker.id, role: UserRole.BUYER });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/steam/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ openidParams: OPENID_PARAMS })
      .expect(409);

    expect(response.body.error.code).toBe('STEAM_ALREADY_LINKED');
  });
});
