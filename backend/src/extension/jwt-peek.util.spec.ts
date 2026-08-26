import { peekJwtTyp, extractBearerToken } from './jwt-peek.util';

describe('jwt-peek.util (I3)', () => {
  it('extracts Bearer token', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer x')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('peeks typ from JWT payload without verification', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'u1', typ: 'extension' }),
    ).toString('base64url');
    expect(peekJwtTyp(`${header}.${payload}.sig`)).toBe('extension');
  });

  it('returns null for malformed tokens', () => {
    expect(peekJwtTyp('not-a-jwt')).toBeNull();
    expect(peekJwtTyp('a.b')).toBeNull();
  });
});
