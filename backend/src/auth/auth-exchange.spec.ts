import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

describe('one-time login exchange', () => {
  function fixture() {
    const rows = new Map<string, any>();
    const db: any = {
      authExchangeCode: {
        create: jest.fn(async ({ data }) => {
          rows.set(data.codeHash, data);
        }),
        findUnique: jest.fn(
          async ({ where }) => rows.get(where.codeHash) ?? null,
        ),
        deleteMany: jest.fn(async ({ where }) => {
          if (!where.codeHash) return { count: 0 };
          const row = rows.get(where.codeHash);
          if (!row || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
          rows.delete(where.codeHash);
          return { count: 1 };
        }),
      },
    };
    db.$transaction = async (fn: any) => fn(db);
    const signAsync = jest.fn(async () => 'access-secret');
    const service = new AuthService(
      { signAsync } as never,
      db,
      {
        getById: async () => ({
          id: 'u',
          username: 'buyer',
          role: 'BUYER',
          status: 'ACTIVE',
        }),
      } as never,
      {} as never,
      {} as never,
      { type: 'steam' } as never,
    );
    return { service, rows, signAsync };
  }
  it('puts only a random code in the redirect and stores only its digest', async () => {
    const { service, rows } = fixture();
    const url = new URL(
      await service.buildFrontendCallbackUrl({
        accessToken: 'access-secret',
        user: { id: 'u' },
      } as never),
    );
    expect(url.searchParams.has('accessToken')).toBe(false);
    const code = url.searchParams.get('code')!;
    expect(code).toMatch(/^[a-f0-9]{64}$/);
    expect(rows.has(code)).toBe(false);
    expect(rows.has(createHash('sha256').update(code).digest('hex'))).toBe(
      true,
    );
  });
  it('allows exactly one competing code exchange', async () => {
    const { service, signAsync } = fixture();
    const url = new URL(
      await service.buildFrontendCallbackUrl({ user: { id: 'u' } } as never),
    );
    const code = url.searchParams.get('code')!;
    const result = await Promise.allSettled([
      service.exchangeCode(code),
      service.exchangeCode(code),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(signAsync).toHaveBeenCalledTimes(1);
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'access', sub: 'u' }),
    );
  });
  it('rejects an expired code without issuing a token', async () => {
    const { service, rows, signAsync } = fixture();
    const url = new URL(
      await service.buildFrontendCallbackUrl({ user: { id: 'u' } } as never),
    );
    for (const row of rows.values()) row.expiresAt = new Date(0);
    await expect(
      service.exchangeCode(url.searchParams.get('code')!),
    ).rejects.toThrow('expired');
    expect(signAsync).not.toHaveBeenCalled();
  });
});
