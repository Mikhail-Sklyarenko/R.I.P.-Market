import { describe, expect, it } from 'vitest';
import {
  normalizeSiteOriginCandidate,
  resolveSiteOriginFromTradeUrl,
  sanitizeTradeOrderUrl,
} from './site-origin.js';

describe('site-origin', () => {
  it('keeps a clean order URL origin', () => {
    expect(
      resolveSiteOriginFromTradeUrl('https://p2pcs.ru/orders/abc-123'),
    ).toBe('https://p2pcs.ru');
  });

  it('recovers QA broken CORS siteUrl blob', () => {
    const broken =
      'p2pcs.ru,https://www.p2pcs.ru,http://p2pcs.ru,http://www.p2pcs.ru,http://31.177.83.107/orders/6fb02141-986c-4dc8-8faf-d5b0b77b8353';
    expect(resolveSiteOriginFromTradeUrl(broken)).toBe('https://p2pcs.ru');
    expect(sanitizeTradeOrderUrl(broken, '6fb02141-986c-4dc8-8faf-d5b0b77b8353')).toBe(
      'https://p2pcs.ru/orders/6fb02141-986c-4dc8-8faf-d5b0b77b8353',
    );
  });

  it('rejects multi-origin candidates in normalize', () => {
    expect(
      normalizeSiteOriginCandidate('https://a.com,https://b.com'),
    ).toBeNull();
  });
});
