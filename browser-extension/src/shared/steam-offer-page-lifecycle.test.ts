import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  detectSteamOfferPageLifecycle,
  isPostAcceptSteamLifecycle,
} from './steam-offer-page-lifecycle.js';

describe('steam-offer-page-lifecycle', () => {
  it('detects Trade Accepted banner', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div class="tradeoffer_items_banner">Trade Accepted 6 Sep, 2026 @ 10:49pm</div>
    </body></html>`);
    const result = detectSteamOfferPageLifecycle(dom.window.document);
    expect(result.lifecycle).toBe('accepted');
    expect(result.offerStatusHint).toBe('accepted');
    expect(isPostAcceptSteamLifecycle(result.lifecycle)).toBe(true);
  });

  it('detects no-longer-valid error as post-accept for UX', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div class="error_ctn">
        <h2>Oh nooooooes!</h2>
        <p>Sorry, some kind of error has occurred: This trade offer is no longer valid.</p>
      </div>
    </body></html>`);
    const result = detectSteamOfferPageLifecycle(dom.window.document);
    expect(result.lifecycle).toBe('invalid');
    expect(result.offerStatusHint).toBe('accepted');
  });

  it('detects active offer with trade slots', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="trade_ygifts"></div>
      <div id="you_notready"></div>
    </body></html>`);
    const result = detectSteamOfferPageLifecycle(dom.window.document);
    expect(result.lifecycle).toBe('active');
    expect(result.offerStatusHint).toBe(null);
    expect(isPostAcceptSteamLifecycle(result.lifecycle)).toBe(false);
  });
});
