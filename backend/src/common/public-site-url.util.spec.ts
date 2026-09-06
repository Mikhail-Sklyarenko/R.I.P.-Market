import {
  getPublicSiteOriginFromEnv,
  normalizeSiteOriginCandidate,
  resolvePublicSiteOrigin,
} from './public-site-url.util';

describe('public-site-url.util', () => {
  describe('normalizeSiteOriginCandidate', () => {
    it('accepts https origin and strips path', () => {
      expect(
        normalizeSiteOriginCandidate('https://p2pcs.ru/orders/abc'),
      ).toBe('https://p2pcs.ru');
    });

    it('rejects comma-joined CORS blobs', () => {
      expect(
        normalizeSiteOriginCandidate(
          'https://p2pcs.ru,https://www.p2pcs.ru',
        ),
      ).toBeNull();
    });

    it('adds https for bare hostname', () => {
      expect(normalizeSiteOriginCandidate('p2pcs.ru')).toBe('https://p2pcs.ru');
    });
  });

  describe('resolvePublicSiteOrigin', () => {
    it('prefers PUBLIC_SITE_URL over CORS list', () => {
      expect(
        resolvePublicSiteOrigin({
          publicSiteUrl: 'https://p2pcs.ru',
          frontendOrigin:
            'https://www.p2pcs.ru,https://p2pcs.ru,http://31.177.83.107',
        }),
      ).toBe('https://p2pcs.ru');
    });

    it('picks https apex from staging CORS list (QA broken-link case)', () => {
      expect(
        resolvePublicSiteOrigin({
          frontendOrigin:
            'https://p2pcs.ru,https://www.p2pcs.ru,http://p2pcs.ru,http://www.p2pcs.ru,http://31.177.83.107',
        }),
      ).toBe('https://p2pcs.ru');
    });

    it('recovers when first CORS entry lacks a scheme', () => {
      expect(
        resolvePublicSiteOrigin({
          frontendOrigin:
            'p2pcs.ru,https://www.p2pcs.ru,http://p2pcs.ru,http://www.p2pcs.ru,http://31.177.83.107',
        }),
      ).toBe('https://p2pcs.ru');
    });

    it('prefers https hostname over http IP', () => {
      expect(
        resolvePublicSiteOrigin({
          frontendOrigin: 'http://31.177.83.107,https://www.p2pcs.ru',
        }),
      ).toBe('https://www.p2pcs.ru');
    });

    it('falls back to localhost when nothing valid', () => {
      expect(
        resolvePublicSiteOrigin({
          frontendOrigin: ',,,not a url',
        }),
      ).toBe('http://localhost:5173');
    });

    it('uses explicit fallback when provided', () => {
      expect(
        resolvePublicSiteOrigin({
          frontendOrigin: '',
          fallback: 'http://127.0.0.1:5173',
        }),
      ).toBe('http://127.0.0.1:5173');
    });
  });

  describe('getPublicSiteOriginFromEnv', () => {
    it('reads PUBLIC_SITE_URL', () => {
      expect(
        getPublicSiteOriginFromEnv({
          PUBLIC_SITE_URL: 'https://p2pcs.ru/',
          FRONTEND_ORIGIN: 'http://localhost:5173',
        }),
      ).toBe('https://p2pcs.ru');
    });

    it('falls back to FRONTEND_ORIGIN list', () => {
      expect(
        getPublicSiteOriginFromEnv({
          FRONTEND_ORIGIN:
            'https://p2pcs.ru,https://www.p2pcs.ru,http://31.177.83.107',
        }),
      ).toBe('https://p2pcs.ru');
    });
  });
});
